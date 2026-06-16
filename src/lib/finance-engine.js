import { MONTHS_NAMES, CARD_META, BASE_YEAR, BASE_MONTH } from './constants'

/**
 * Motor financeiro genérico.
 * Recebe despesas e receitas do Supabase e projeta os 9 meses (Abril-Dezembro).
 * Quando `today` é informado, calcula a posição de cada evento em relação a hoje
 * (vencido / vence hoje / a vencer) e estima encargos de atraso.
 */

// Índice do mês (0 = Abril … 8 = Dezembro) para uma data real.
export function monthIdxForDate(date = new Date()) {
  const y = date.getFullYear()
  if (y < BASE_YEAR) return 0
  if (y > BASE_YEAR) return 8
  return Math.max(0, Math.min(8, date.getMonth() - BASE_MONTH))
}

// Data real (00:00) de um evento no mês `monthIdx`, dia `day`.
export function dateForMonthDay(monthIdx, day) {
  return new Date(BASE_YEAR, BASE_MONTH + monthIdx, day || 1)
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/**
 * Estima encargos de atraso (padrão brasileiro): multa de 2% + juros de mora
 * de 1% ao mês (proporcional aos dias). Retorna multa, juros e total.
 */
export function computeLateCharge(amount, daysLate) {
  const a = parseFloat(amount) || 0
  if (!daysLate || daysLate <= 0) return { fine: 0, interest: 0, charge: 0, total: a, daysLate: 0 }
  const fine = a * 0.02
  const interest = a * 0.01 * (daysLate / 30)
  const charge = fine + interest
  return { fine, interest, charge, total: a + charge, daysLate }
}

export function computeAll(expenses = [], extraIncome = [], today = null) {
  const hasToday = today instanceof Date && !isNaN(today)
  const todayMid = hasToday ? startOfDay(today) : null
  const inRange = hasToday &&
    today.getFullYear() === BASE_YEAR &&
    today.getMonth() >= BASE_MONTH && today.getMonth() <= BASE_MONTH + 8
  const currentMonthIdx = inRange ? monthIdxForDate(today) : -1

  let carryover = 0
  const metrics = []

  for (let m = 0; m < 9; m++) {
    const monthName = MONTHS_NAMES[m]

    // Receitas do mês (vindas do banco)
    const monthIncome = extraIncome
      .filter(inc => m >= inc.start_month && m < inc.start_month + (inc.total_months || 1))
      .map(inc => ({
        label: inc.description,
        amount: parseFloat(inc.amount),
        day: inc.pay_day || 5
      }))

    const incomeThisMonth = []

    if (m > 0 && carryover !== 0) {
      incomeThisMonth.push({
        label: carryover > 0 ? 'Sobra mês anterior' : 'Dívida anterior',
        amount: carryover,
        day: 1,
        isNegativeCarry: carryover < 0
      })
    }

    incomeThisMonth.push(...monthIncome)

    const totalIncome = incomeThisMonth.reduce((sum, i) => sum + i.amount, 0)

    // Despesas ativas no mês
    const activeExpenses = expenses.map(exp => {
      const { start_month, total_installments, installment_offset = 1 } = exp
      if (m >= start_month && m < start_month + total_installments) {
        const c_name = CARD_META[exp.card]?.name || exp.card
        const current_inst = (m - start_month) + installment_offset
        const desc = exp.is_fee
          ? 'Juros/Multa'
          : exp.description || `Fatura ${MONTHS_NAMES[start_month]}`

        const isPaid = exp.paid_through != null && m <= exp.paid_through
        return {
          id: exp.id,
          cardId: exp.card,
          cardName: c_name,
          desc,
          amount: parseFloat(exp.amount),
          instStr: exp.is_fee ? '—' : `${current_inst}/${total_installments}`,
          payDay: exp.pay_day || CARD_META[exp.card]?.payDay || 10,
          isNubank: exp.card === 'nubank',
          isFee: !!exp.is_fee,
          category: exp.category || null,
          isPaid,
          paidThrough: exp.paid_through ?? null
        }
      }
      return null
    }).filter(Boolean)

    const lateFees = activeExpenses.filter(e => e.isFee)
    const m_expenses = activeExpenses.reduce((s, a) => s + a.amount, 0)
    const totalOut = m_expenses
    const balance = totalIncome - totalOut

    // Alertas dinâmicos
    const alerts = buildAlerts(incomeThisMonth, activeExpenses, balance, carryover, m)

    const ctx = { monthIdx: m, todayMid, currentMonthIdx, inRange }
    const timelineEvents = buildTimelineEvents(incomeThisMonth, activeExpenses, ctx)

    // Resumo de pagamentos do mês — considera o status de pago de cada despesa.
    // paidOut = já pago (saiu da conta) · unpaidOut = ainda a pagar.
    let paidOut = 0, unpaidOut = 0, overdueAmount = 0, overdueCharge = 0
    activeExpenses.forEach(e => {
      if (e.isPaid) { paidOut += e.amount; return }
      unpaidOut += e.amount
      if (m === currentMonthIdx && todayMid) {
        const evDate = dateForMonthDay(m, e.payDay)
        if (evDate < todayMid) {
          overdueAmount += e.amount
          const daysLate = Math.max(0, Math.round((todayMid - evDate) / 86400000))
          overdueCharge += computeLateCharge(e.amount, daysLate).charge
        }
      }
    })
    const pendingPay = unpaidOut          // falta pagar = tudo que não está pago
    const saldoAtual = totalIncome - paidOut // dinheiro que você tem agora (só o pago saiu)

    metrics.push({
      idx: m,
      monthName,
      isCurrent: m === currentMonthIdx,
      totalIn: totalIncome,
      totalOut,
      balance,
      activeCardsCount: new Set(activeExpenses.map(e => e.cardName)).size,
      incomeList: incomeThisMonth,
      expensesList: activeExpenses,
      lateFees,
      alerts,
      timelineEvents,
      pendingPay,
      overdueAmount,
      overdueCharge,
      paidOut,
      unpaidOut,
      saldoAtual,
    })

    carryover = balance
  }

  return metrics
}

/**
 * Alertas inteligentes baseados na situação real do mês.
 */
function buildAlerts(income, expenses, balance, prevCarry, monthIdx) {
  const alerts = []

  // Alerta: saldo negativo
  if (balance < 0) {
    alerts.push({
      type: 'neg',
      text: `Saldo negativo de ${formatCurrency(balance)}. As saídas superam as entradas neste mês.`
    })
  }

  // Alerta: juros/multas presentes
  const fees = expenses.filter(e => e.isFee)
  if (fees.length > 0) {
    const feeTotal = fees.reduce((s, f) => s + f.amount, 0)
    const feeCards = [...new Set(fees.map(f => f.cardName))].join(', ')
    alerts.push({
      type: 'warn',
      text: `Encargos de ${formatCurrency(feeTotal)} detectados em: ${feeCards}. Considere antecipar pagamentos.`
    })
  }

  // Alerta: carryover insuficiente para cobrir a maior fatura
  if (monthIdx > 0) {
    const cards = {}
    expenses.forEach(e => {
      if (!cards[e.cardName]) cards[e.cardName] = 0
      cards[e.cardName] += e.amount
    })
    const sorted = Object.entries(cards).sort((a, b) => b[1] - a[1])
    if (sorted.length > 0 && prevCarry < sorted[0][1] && prevCarry >= 0) {
      alerts.push({
        type: 'warn',
        text: `A sobra anterior (${formatCurrency(prevCarry)}) não cobre a fatura do ${sorted[0][0]} (${formatCurrency(sorted[0][1])}). Depende de receita nova no mês.`
      })
    }
  }

  // Alerta: mês saudável
  if (balance > 0 && fees.length === 0 && alerts.length === 0) {
    alerts.push({
      type: 'pos',
      text: `Mês saudável. Sobra de ${formatCurrency(balance)} transportada para o próximo período.`
    })
  }

  return alerts
}

// Posição de um evento em relação a hoje.
function eventStatus(ctx, day) {
  if (!ctx.inRange || ctx.currentMonthIdx < 0) return 'future'
  if (ctx.monthIdx < ctx.currentMonthIdx) return 'past'
  if (ctx.monthIdx > ctx.currentMonthIdx) return 'future'
  const evDate = dateForMonthDay(ctx.monthIdx, day)
  if (evDate < ctx.todayMid) return 'past'
  if (evDate.getTime() === ctx.todayMid.getTime()) return 'today'
  return 'upcoming'
}

function buildTimelineEvents(incomeList, activeExpenses, ctx) {
  const events = []

  incomeList.forEach(inc => {
    events.push({
      type: inc.isNegativeCarry ? 'expense' : 'income',
      day: inc.day,
      label: inc.label,
      amount: inc.amount
    })
  })

  // Agrupa despesas do mesmo cartão/dia para não poluir a UI (rastreando o pago)
  const groupedCards = {}
  activeExpenses.forEach(exp => {
    const key = `${exp.cardName}-${exp.payDay}`
    if (!groupedCards[key]) {
      groupedCards[key] = {
        type: exp.isFee ? 'late' : 'expense',
        day: exp.payDay,
        label: exp.cardName,
        amount: 0,
        unpaidAmt: 0,
        hasFee: false
      }
    }
    groupedCards[key].amount += exp.amount
    if (!exp.isPaid) groupedCards[key].unpaidAmt += exp.amount
    if (exp.isFee) {
      groupedCards[key].hasFee = true
      groupedCards[key].type = 'late'
    }
  })

  Object.values(groupedCards).forEach(g => {
    events.push({
      type: g.type,
      day: g.day,
      label: g.label,
      amount: g.amount,
      unpaidAmt: g.unpaidAmt,
      fullyPaid: g.amount > 0 && g.unpaidAmt === 0,
      lateLabel: g.hasFee ? 'Atraso embutido' : null
    })
  })

  // Status relativo a hoje. Item pago => 'paid' (sem encargo). Encargo só no não-pago.
  events.forEach(ev => {
    if (ev.fullyPaid) { ev.status = 'paid'; return }
    ev.status = eventStatus(ctx, ev.day)
    if ((ev.type === 'expense' || ev.type === 'late') && ev.status === 'past' && ctx.monthIdx === ctx.currentMonthIdx) {
      const evDate = dateForMonthDay(ctx.monthIdx, ev.day)
      const daysLate = Math.max(0, Math.round((ctx.todayMid - evDate) / 86400000))
      ev.daysLate = daysLate
      ev.lateEstimate = computeLateCharge(ev.unpaidAmt ?? ev.amount, daysLate).charge
    }
  })

  events.sort((a, b) => a.day - b.day)
  return events
}

export function formatCurrency(value) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
