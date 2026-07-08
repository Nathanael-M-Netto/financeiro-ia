import { MONTHS_NAMES, HORIZON } from './constants'

/**
 * Análise por cartão. Trabalha sobre as despesas (planos de parcelamento) e os
 * cartões do usuário, projetando o horizonte (Abril/2026 a Dezembro/2027), no
 * mesmo frame do resto do app. currentMonth = 0 (Abril) por padrão.
 */

// Casa uma despesa a um cartão por card_id (novo) OU pela chave de texto legada.
function expenseBelongsToCard(exp, card) {
  if (exp.card_id && card.id) return exp.card_id === card.id
  return exp.card === card.key
}

// Valor da fatura do cartão em cada mês do horizonte.
function monthlyInvoices(expenses, card) {
  const months = new Array(HORIZON).fill(0)
  for (const exp of expenses) {
    if (!expenseBelongsToCard(exp, card)) continue
    const start = exp.start_month || 0
    const total = exp.total_installments || 1
    const amount = parseFloat(exp.amount) || 0
    const end = exp.is_recurring ? HORIZON : Math.min(start + total, HORIZON)
    for (let m = Math.max(0, start); m < end; m++) {
      months[m] += amount
    }
  }
  return months
}

export function analyzeCard(expenses, card, currentMonth = 0) {
  const cardExpenses = expenses.filter(e => expenseBelongsToCard(e, card))
  const months = monthlyInvoices(expenses, card)

  const currentInvoice = months[currentMonth] || 0
  const peakInvoice = months.length ? Math.max(...months) : 0
  const peakMonthIdx = months.indexOf(peakInvoice)

  const limit = card.credit_limit ? parseFloat(card.credit_limit) : null
  const utilizationPct = limit && limit > 0 ? (currentInvoice / limit) * 100 : null
  const peakUtilizationPct = limit && limit > 0 ? (peakInvoice / limit) * 100 : null

  // Total ainda a pagar do mês atual em diante.
  let remaining = 0
  for (let m = currentMonth; m < HORIZON; m++) remaining += months[m]

  // Planos (não-juros) com parcela em aberto do mês atual em diante.
  const openPlans = cardExpenses.filter(e => {
    const start = e.start_month || 0
    const total = e.total_installments || 1
    return !e.is_fee && (e.is_recurring || start + total - 1 >= currentMonth)
  })

  // Melhor dia de compra: logo após o fechamento (maximiza o prazo de pagamento).
  const bestBuyDay = card.closing_day ? (card.closing_day % 31) + 1 : null

  return {
    months,
    currentInvoice,
    peakInvoice,
    peakMonthIdx,
    peakMonthName: MONTHS_NAMES[peakMonthIdx] || MONTHS_NAMES[0],
    limit,
    utilizationPct,
    peakUtilizationPct,
    remaining,
    openPlansCount: openPlans.length,
    bestBuyDay,
    cardExpenses,
    overLimit: limit && limit > 0 ? peakInvoice > limit : false,
  }
}

export function analyzeAllCards(expenses, cards, currentMonth = 0) {
  const analyzed = cards.map(c => ({ ...c, analysis: analyzeCard(expenses, c, currentMonth) }))
  const totalAll = analyzed.reduce((s, c) => s + c.analysis.currentInvoice, 0)
  for (const c of analyzed) {
    c.analysis.shareOfTotal = totalAll > 0 ? (c.analysis.currentInvoice / totalAll) * 100 : 0
  }
  return analyzed
}
