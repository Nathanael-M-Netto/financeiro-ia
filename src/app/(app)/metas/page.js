import { createClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import GoalsClient from './GoalsClient'

export default async function GoalsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: goals } = await supabase
    .from('goals')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  const { data: transactions, error: txError } = await supabase
    .from('goal_transactions')
    .select('*')
    .eq('user_id', user.id)
    .order('occurred_on', { ascending: false })

  return (
    <GoalsClient
      initialGoals={goals || []}
      initialTransactions={transactions || []}
      migrationReady={!txError}
      todayISO={new Date().toISOString().slice(0, 10)}
    />
  )
}
