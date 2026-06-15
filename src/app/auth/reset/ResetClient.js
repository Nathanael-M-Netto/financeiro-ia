'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

export default function ResetClient() {
  const router = useRouter()
  const supabase = createClient()

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (password.length < 6) { setError('A senha precisa ter ao menos 6 caracteres.'); return }
    if (password !== confirm) { setError('As senhas não coincidem.'); return }

    setLoading(true)
    setError(null)
    const { error: err } = await supabase.auth.updateUser({ password })
    if (err) {
      setError(err.message)
      setLoading(false)
      return
    }
    setDone(true)
    setTimeout(() => { router.push('/dashboard'); router.refresh() }, 1300)
  }

  return (
    <div className="login-wrapper">
      <div className="login-glow-1" />
      <div className="login-glow-2" />
      <div className="login-card">
        <div className="login-header">
          <h1 className="login-title">Nova senha</h1>
          <p className="login-subtitle">Defina uma nova senha para sua conta.</p>
        </div>

        {done ? (
          <div className="login-success">
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ flexShrink: 0, marginTop: 2 }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>Senha alterada com sucesso! Redirecionando…</span>
          </div>
        ) : (
          <form onSubmit={submit} className="login-form">
            <div className="login-field">
              <label htmlFor="np">Nova senha</label>
              <input id="np" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="new-password" maxLength={72} />
            </div>
            <div className="login-field">
              <label htmlFor="cp">Confirmar nova senha</label>
              <input id="cp" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="••••••••" autoComplete="new-password" maxLength={72} />
            </div>
            {error && (
              <div className="login-error">
                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ flexShrink: 0, marginTop: 2 }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{error}</span>
              </div>
            )}
            <button type="submit" disabled={loading} className="login-submit">
              {loading && <span className="login-spinner" />}
              {loading ? 'Salvando...' : 'Salvar nova senha'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
