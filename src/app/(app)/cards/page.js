import { createClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import CardsClient from './CardsClient'

export default async function CardsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  const { data: cards } = await supabase
    .from('cards')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  const { data: expenses } = await supabase
    .from('expenses')
    .select('*')
    .eq('user_id', user.id)

  return <CardsClient initialCards={cards || []} expenses={expenses || []} userId={user.id} />
}
