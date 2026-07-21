import { BASE_MONTH, BASE_YEAR, HORIZON } from './constants'

const DAY_MS = 86400000

export function parseLocalDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return null
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return Number.isNaN(date.getTime()) ? null : date
}

export function toISODate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function targetDateForGoal(goal) {
  const explicit = parseLocalDate(goal?.target_date)
  if (explicit) return explicit
  const idx = Math.max(0, Math.min(HORIZON - 1, Number(goal?.target_month) || 0))
  return new Date(BASE_YEAR, BASE_MONTH + idx + 1, 0)
}

export function monthIndexForTarget(date) {
  const raw = (date.getFullYear() - BASE_YEAR) * 12 + (date.getMonth() - BASE_MONTH)
  return Math.max(0, Math.min(HORIZON - 1, raw))
}

export function transactionSignedAmount(transaction) {
  const amount = Number(transaction?.amount) || 0
  return transaction?.type === 'withdrawal' ? -amount : amount
}

export function currentGoalBalance(goal, transactions = []) {
  const initial = Math.max(0, Number(goal?.initial_amount) || 0)
  return Math.max(0, transactions.reduce((sum, tx) => sum + transactionSignedAmount(tx), initial))
}

function remainingContributionPeriods(today, target, contributionDay) {
  if (target < today) return 0
  const day = Math.max(1, Math.min(31, Number(contributionDay) || 1))
  let count = 0
  let cursor = new Date(today.getFullYear(), today.getMonth(), 1)
  const last = new Date(target.getFullYear(), target.getMonth(), 1)
  while (cursor <= last) {
    const actualDay = Math.min(day, new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate())
    const contributionDate = new Date(cursor.getFullYear(), cursor.getMonth(), actualDay)
    if (contributionDate >= today && contributionDate <= target) count++
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
  }
  return count
}

// Regra pedida no áudio: primeiro soma o aporte; depois aplica os juros do mês.
export function projectGoalBalance(current, monthlyContribution, monthlyRatePct, periods) {
  let balance = Math.max(0, Number(current) || 0)
  const contribution = Math.max(0, Number(monthlyContribution) || 0)
  const rate = Math.max(0, Number(monthlyRatePct) || 0) / 100
  for (let i = 0; i < periods; i++) balance = (balance + contribution) * (1 + rate)
  return balance
}

function requiredContribution(target, current, rate, periods) {
  if (periods <= 0) return Math.max(0, target - current)
  if (projectGoalBalance(current, 0, rate, periods) >= target) return 0
  let low = 0
  let high = Math.max(target, 1)
  for (let i = 0; i < 60; i++) {
    const mid = (low + high) / 2
    if (projectGoalBalance(current, mid, rate, periods) >= target) high = mid
    else low = mid
  }
  return high
}

export function analyzeGoal(goal, transactions = [], todayInput = new Date()) {
  const today = new Date(todayInput.getFullYear(), todayInput.getMonth(), todayInput.getDate())
  const targetDate = targetDateForGoal(goal)
  const target = Math.max(0, Number(goal?.target_amount) || 0)
  const current = currentGoalBalance(goal, transactions)
  const plannedMonthly = Math.max(0, Number(goal?.monthly_contribution) || 0)
  const rate = Math.max(0, Number(goal?.monthly_interest_rate) || 0)
  const periods = remainingContributionPeriods(today, targetDate, goal?.contribution_day)
  const projected = projectGoalBalance(current, plannedMonthly, rate, periods)
  const recommendedMonthly = requiredContribution(target, current, rate, periods)
  const missing = Math.max(0, target - current)
  const progress = target > 0 ? Math.max(0, Math.min(100, (current / target) * 100)) : 0
  const projectedProgress = target > 0 ? Math.max(0, Math.min(100, (projected / target) * 100)) : 0
  const daysLeft = Math.max(0, Math.ceil((targetDate - today) / DAY_MS))
  const reached = target > 0 && current >= target
  const onTrack = reached || projected >= target
  const monthlyGap = Math.max(0, recommendedMonthly - plannedMonthly)

  return {
    targetDate, target, current, plannedMonthly, rate, periods, projected,
    recommendedMonthly, monthlyGap, missing, progress, projectedProgress,
    daysLeft, reached, onTrack, expired: targetDate < today && !reached,
  }
}

export function buildGoalProjection(goal, transactions = [], todayInput = new Date()) {
  const analysis = analyzeGoal(goal, transactions, todayInput)
  const rows = []
  let balance = analysis.current
  const rate = analysis.rate / 100
  let cursor = new Date(todayInput.getFullYear(), todayInput.getMonth(), 1)
  const targetMonth = new Date(analysis.targetDate.getFullYear(), analysis.targetDate.getMonth(), 1)
  let first = true
  while (cursor <= targetMonth && rows.length < 60) {
    const actualDay = Math.min(Number(goal?.contribution_day) || 1, new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate())
    const contributionDate = new Date(cursor.getFullYear(), cursor.getMonth(), actualDay)
    const contribution = (!first || contributionDate >= todayInput) && contributionDate <= analysis.targetDate
      ? analysis.plannedMonthly : 0
    const interest = (balance + contribution) * rate
    balance += contribution + interest
    rows.push({
      date: new Date(cursor), contribution, interest, balance,
    })
    first = false
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
  }
  return rows
}
