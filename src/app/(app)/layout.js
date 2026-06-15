import { createClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import Sidebar from './Sidebar'

export default async function AppLayout({ children }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="app-shell">
      <Sidebar userName={user.user_metadata?.full_name} userEmail={user.email} />
      <main className="app-main">{children}</main>
    </div>
  )
}
