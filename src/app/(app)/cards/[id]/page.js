import { createClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { monthIdxForDate } from '@/lib/finance-engine'
import CardDetailClient from './CardDetailClient'

export default async function CardDetailPage({ params }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: card } = await supabase
    .from('cards').select('*').eq('id', id).eq('user_id', user.id).maybeSingle()
  if (!card) redirect('/cards')

  const { data: expenses } = await supabase
    .from('expenses').select('*').eq('user_id', user.id)

  return (
    <CardDetailClient
      card={card}
      expenses={expenses || []}
      currentMonthIdx={monthIdxForDate()}
    />
  )
}
