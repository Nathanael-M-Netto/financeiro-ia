import { createClient } from '@/lib/supabase-server'
import Link from 'next/link'
import ResetClient from './ResetClient'

export default async function ResetPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return (
      <div className="login-wrapper">
        <div className="login-glow-1" />
        <div className="login-card" style={{ textAlign: 'center' }}>
          <div className="login-header">
            <h1 className="login-title">Link inválido</h1>
            <p className="login-subtitle">O link de recuperação expirou ou já foi usado.</p>
          </div>
          <Link href="/login" className="login-submit" style={{ marginTop: '18px', textDecoration: 'none', display: 'inline-flex', justifyContent: 'center' }}>
            Voltar ao login
          </Link>
        </div>
      </div>
    )
  }

  return <ResetClient />
}
