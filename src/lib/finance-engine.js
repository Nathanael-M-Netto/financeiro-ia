import { MONTHS_NAMES, CARD_META } from './constants'

/**
 * Motor financeiro genérico.
 * Recebe despesas e receitas do Supabase e projeta os 9 meses (Abril-Dezembro).
 * Todos os dados vêm do banco — nada hardcoded.
 */
export function computeAll(expenses = [], extraIncome = []) {
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

        return {
          cardId: exp.card,
          cardName: c_name,
          desc,
          amount: parseFloat(exp.amount),
          instStr: exp.is_fee ? '—' : `${current_inst}/${total_installments}`,
          payDay: exp.pay_day || CARD_META[exp.card]?.payDay || 10,
          isNubank: exp.card === 'nubank',
          isFee: !!exp.is_fee
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

    const timelineEvents = buildTimelineEvents(incomeThisMonth, activeExpenses)

    metrics.push({
      idx: m,
      monthName,
      totalIn: totalIncome,
      totalOut,
      balance,
      activeCardsCount: new Set(activeExpenses.map(e => e.cardName)).size,
      incomeList: incomeThisMonth,
      expensesList: activeExpenses,
      lateFees,
      alerts,
      timelineEvents
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

function buildTimelineEvents(incomeList, activeExpenses) {
  const events = []

  incomeList.forEach(inc => {
    events.push({ 
      type: inc.isNegativeCarry ? 'expense' : 'income', 
      day: inc.day, 
      label: inc.label, 
      amount: inc.amount 
    })
  })

  // Group similar card expenses on the same day to avoid UI clutter
  const groupedCards = {}
  activeExpenses.forEach(exp => {
    const key = `${exp.cardName}-${exp.payDay}`
    if (!groupedCards[key]) {
      groupedCards[key] = {
        type: exp.isFee ? 'late' : 'expense',
        day: exp.payDay,
        label: exp.cardName,
        amount: 0,
        hasFee: false
      }
    }
    groupedCards[key].amount += exp.amount
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
      lateLabel: g.hasFee ? 'Atraso embutido' : null
    })
  })

  events.sort((a, b) => a.day - b.day)
  return events
}

export function formatCurrency(value) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
