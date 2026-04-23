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

  return (
    <ClientDashboard 
      initialExpenses={expenses || []} 
      initialIncome={extraIncome || []} 
      userEmail={user.email}
      userName={user.user_metadata?.full_name}
    />
  )
}
