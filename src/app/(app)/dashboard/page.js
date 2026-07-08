import { createClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import ClientDashboard from './ClientDashboard'

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: expenses } = await supabase
    .from('expenses')
    .select('*')
    .eq('user_id', user.id)

  const { data: extraIncome } = await supabase
    .from('extra_income')
    .select('*')
    .eq('user_id', user.id)

  const { data: goals } = await supabase
    .from('goals')
    .select('*')
    .eq('user_id', user.id)
    .order('target_month', { ascending: true })

  // Orçamentos por categoria (tabela criada na migration 0007; se ainda não existir, segue vazio).
  const { data: budgets } = await supabase
    .from('budgets')
    .select('*')
    .eq('user_id', user.id)

  // Cartões: fonte única do dia de vencimento (as despesas derivam dele).
  const { data: cards } = await supabase
    .from('cards')
    .select('*')
    .eq('user_id', user.id)

  return (
    <ClientDashboard
      initialExpenses={expenses || []}
      initialIncome={extraIncome || []}
      initialGoals={goals || []}
      initialBudgets={budgets || []}
      initialCards={cards || []}
      userEmail={user.email}
      userName={user.user_metadata?.full_name}
    />
  )
}
