import { MONTHS_NAMES, CARD_META, BASE_YEAR, BASE_MONTH, HORIZON } from './constants'

/**
 * Motor financeiro genérico.
 * Recebe despesas e receitas do Supabase e projeta o horizonte (Abril/2026 a Dezembro/2027).
 * Quando `today` é informado, calcula a posição de cada evento em relação a hoje
 * (vencido / vence hoje / a vencer) e estima encargos de atraso.
 */

// Índice do mês (0 = Abril/2026 … 20 = Dezembro/2027) para uma data real.
export function monthIdxForDate(date = new Date()) {
  const idx = (date.getFullYear() - BASE_YEAR) * 12 + (date.getMonth() - BASE_MONTH)
  return Math.max(0, Math.min(HORIZON - 1, idx))
}

// Limita um dia ao último dia válido do mês (ex.: dia 31 em mês de 30 vira 30),
// evitando que o `new Date` "vaze" para o mês seguinte.
export function clampDayToMonth(monthIdx, day) {
  const lastDay = new Date(BASE_YEAR, BASE_MONTH + monthIdx + 1, 0).getDate()
  return Math.max(1, Math.min(parseInt(day, 10) || 1, lastDay))
}

// Data real (00:00) de um evento no mês `monthIdx`, dia `day`.
export function dateForMonthDay(monthIdx, day) {
  return new Date(BASE_YEAR, BASE_MONTH + monthIdx, clampDayToMonth(monthIdx, day))
}

// Índice de mês absoluto (0 = Abril/2026) SEM travar no horizonte — usado em cálculos.
function rawMonthIdx(date) {
  return (date.getFullYear() - BASE_YEAR) * 12 + (date.getMonth() - BASE_MONTH)
}

/**
 * Dada uma compra (data) num cartão, descobre em qual FATURA ela cai e quando
 * vence, no padrão de mercado (fechamento → vencimento).
 *
 * - Com `closing_day`: a compra entra na fatura que fecha neste mês se foi feita
 *   até o fechamento; senão, na próxima. O vencimento cai no mesmo mês do
 *   fechamento se o dia de vencimento for depois do fechamento; senão, no mês seguinte.
 * - Sem `closing_day`: regra simples — comprou até o dia do vencimento, é a fatura
 *   deste mês; senão, a do mês que vem.
 *
 * Retorna { startMonthIdx, payDay } no frame absoluto (0 = Abril/2026).
 */
export function invoiceSlotForPurchase(card, purchaseDate = new Date()) {
  const dueDay = clampDayToMonthlessDefault(card?.due_day, 10)
  const purchaseIdx = rawMonthIdx(purchaseDate)
  const d = purchaseDate.getDate()
  let dueIdx
  if (card?.closing_day) {
    const closeDay = card.closing_day
    const closingIdx = d <= closeDay ? purchaseIdx : purchaseIdx + 1
    dueIdx = dueDay > closeDay ? closingIdx : closingIdx + 1
  } else {
    dueIdx = d <= dueDay ? purchaseIdx : purchaseIdx + 1
  }
  const clamped = Math.max(0, Math.min(HORIZON - 1, dueIdx))
  return { startMonthIdx: clamped, payDay: dueDay }
}

// Dia válido (1–31) com fallback; não depende de um mês específico.
function clampDayToMonthlessDefault(day, fallback) {
  const n = parseInt(day, 10)
  if (!Number.isFinite(n)) return fallback
  return Math.max(1, Math.min(31, n))
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

export function computeAll(expenses = [], extraIncome = [], today = null, cards = []) {
  const hasToday = today instanceof Date && !isNaN(today)
  const todayMid = hasToday ? startOfDay(today) : null
  const rawIdx = hasToday ? (today.getFullYear() - BASE_YEAR) * 12 + (today.getMonth() - BASE_MONTH) : -1
  const inRange = hasToday && rawIdx >= 0 && rawIdx <= HORIZON - 1
  const currentMonthIdx = inRange ? rawIdx : -1

  // Fonte única de verdade do vencimento: o CARTÃO. Se o usuário mudar o
  // due_day do cartão, todas as despesas dele acompanham na hora. O pay_day
  // gravado na despesa só manda no "extra"/à vista (cada gasto tem sua data).
  const cardById = new Map((cards || []).map(c => [c.id, c]))
  const cardByKey = new Map((cards || []).map(c => [c.key, c]))
  const payDayFor = (exp) => {
    const cardObj = (exp.card_id && cardById.get(exp.card_id)) || cardByKey.get(exp.card) || null
    const isCashLike = exp.card === 'extra' || cardObj?.key === 'extra'
    if (isCashLike) return exp.pay_day || cardObj?.due_day || 10
    return cardObj?.due_day || exp.pay_day || CARD_META[exp.card]?.payDay || 10
  }

  let carryover = 0
  const metrics = []

  for (let m = 0; m < HORIZON; m++) {
    const monthName = MONTHS_NAMES[m]

    // Receitas do mês (vindas do banco). Fixa mensal = todo mês a partir do início.
    const monthIncome = extraIncome
      .filter(inc => inc.is_recurring
        ? m >= inc.start_month
        : (m >= inc.start_month && m < inc.start_month + (inc.total_months || 1)))
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
        isCarryover: true,
        isNegativeCarry: carryover < 0
      })
    }

    incomeThisMonth.push(...monthIncome)

    const totalIncome = incomeThisMonth.reduce((sum, i) => sum + i.amount, 0)
    const newIncome = monthIncome.reduce((sum, item) => sum + item.amount, 0)

    // Despesas ativas no mês
    const activeExpenses = expenses.map(exp => {
      const { start_month, total_installments, installment_offset = 1 } = exp
      // Fixa mensal: ativa do início até o fim do horizonte (sem parcelas).
      const activeNow = exp.is_recurring
        ? m >= start_month
        : (m >= start_month && m < start_month + total_installments)
      if (activeNow) {
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
          instStr: exp.is_fee ? '—' : (exp.is_recurring ? 'fixa' : `${current_inst}/${total_installments}`),
          payDay: payDayFor(exp),
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
    // Grana atual = dinheiro que JÁ ENTROU até hoje − o que JÁ SAIU (pago).
    // Receita com dia futuro (ex.: salário dia 10 quando hoje é dia 7) ainda
    // não conta — ela aparece separada em `pendingIn` ("ainda entra este mês").
    const isCurrentMonth = m === currentMonthIdx && hasToday
    const receivedIn = isCurrentMonth
      ? incomeThisMonth.reduce((s, i) => s + ((i.day || 1) <= today.getDate() ? i.amount : 0), 0)
      : totalIncome
    const pendingIn = totalIncome - receivedIn
    const saldoAtual = receivedIn - paidOut

    metrics.push({
      idx: m,
      monthName,
      isCurrent: m === currentMonthIdx,
      totalIn: totalIncome,
      newIncome,
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
      receivedIn,
      pendingIn,
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
