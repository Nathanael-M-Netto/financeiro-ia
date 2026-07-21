import { createClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import ClientDashboard from './ClientDashboard'

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // As consultas são independentes; em paralelo a Visão geral abre sem somar
  // cinco esperas de rede consecutivas.
  const [expensesResult, incomeResult, goalsResult, transactionsResult, budgetsResult, cardsResult] = await Promise.all([
    supabase.from('expenses').select('*').eq('user_id', user.id),
    supabase.from('extra_income').select('*').eq('user_id', user.id),
    supabase.from('goals').select('*').eq('user_id', user.id).order('target_month', { ascending: true }),
    supabase.from('goal_transactions').select('*').eq('user_id', user.id),
    supabase.from('budgets').select('*').eq('user_id', user.id),
    supabase.from('cards').select('*').eq('user_id', user.id),
  ])

  const expenses = expensesResult.data
  const extraIncome = incomeResult.data
  const goals = goalsResult.data
  const goalTransactions = transactionsResult.data
  const budgets = budgetsResult.data
  const cards = cardsResult.data

  return (
    <ClientDashboard
      initialExpenses={expenses || []}
      initialIncome={extraIncome || []}
      initialGoals={goals || []}
      initialGoalTransactions={goalTransactions || []}
      initialBudgets={budgets || []}
      initialCards={cards || []}
      userEmail={user.email}
      userName={user.user_metadata?.full_name}
    />
  )
}
