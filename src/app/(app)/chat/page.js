import { createClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import ChatClient from './ChatClient'

export default async function ChatPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: messages } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  return (
    <ChatClient
      initialMessages={messages || []}
      userId={user.id}
      userName={user.user_metadata?.full_name}
    />
  )
}
