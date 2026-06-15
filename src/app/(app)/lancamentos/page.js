import { createClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import LancamentosClient from './LancamentosClient'

export default async function LancamentosPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: expenses }, { data: incomes }, { data: cards }] = await Promise.all([
    supabase.from('expenses').select('*').eq('user_id', user.id).order('created_at', { ascending: true }),
    supabase.from('extra_income').select('*').eq('user_id', user.id).order('created_at', { ascending: true }),
    supabase.from('cards').select('*').eq('user_id', user.id).order('created_at', { ascending: true }),
  ])

  return (
    <LancamentosClient
      initialExpenses={expenses || []}
      initialIncomes={incomes || []}
      cards={cards || []}
      userId={user.id}
    />
  )
}
