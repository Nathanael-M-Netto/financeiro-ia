'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

export default function LoginPage() {
  const [isLoginMode, setIsLoginMode] = useState(true)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  
  const router = useRouter()
  const supabase = createClient()

  const sanitize = (str) => str.trim().replace(/[<>]/g, '')

  const handleForgotPassword = async () => {
    const cleanEmail = sanitize(email)
    if (!cleanEmail) {
      setError('Digite seu e-mail acima para recuperar a senha.')
      return
    }
    setLoading(true)
    setError(null)
    setSuccess(null)
    const { error: err } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset`,
    })
    if (err) setError(err.message)
    else setSuccess(`Enviamos um link de recuperação para ${cleanEmail}. Confira seu e-mail.`)
    setLoading(false)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    const cleanEmail = sanitize(email)
    const cleanName = sanitize(fullName)

    if (!cleanEmail || !password) {
      setError('Preencha e-mail e senha.')
      return
    }

    if (password.length < 6) {
      setError('Senha precisa ter pelo menos 6 caracteres.')
      return
    }

    if (!isLoginMode && !cleanName) {
      setError('Diga como quer ser chamado.')
      return
    }

    setLoading(true)
    setError(null)
    setSuccess(null)

    if (isLoginMode) {
      const { error: err } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      })

      if (err) {
        setError(
          err.message.includes('Invalid login')
            ? 'Credenciais inválidas. Verifique seu e-mail e senha.'
            : err.message
        )
        setLoading(false)
      } else {
        router.push('/dashboard')
        router.refresh()
      }
    } else {
      const { error: err } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: { full_name: cleanName },
          emailRedirectTo: `${window.location.origin}/auth/callback`
        }
      })

      if (err) {
        setError(err.message)
      } else {
        setSuccess(`Pronto, ${cleanName}! Conta criada com sucesso. Verifique seu e-mail para confirmar a conta antes de fazer login.`)
        setIsLoginMode(true)
        setPassword('')
      }
      setLoading(false)
    }
  }

  return (
    <div className="login-wrapper">
      <div className="login-glow-1" />
      <div className="login-glow-2" />

      <div className="login-card">
        <div className="login-header">
          <div className="login-icon">
            <svg width="26" height="26" fill="none" stroke="#fff" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="login-title">FinDash</h1>
          <p className="login-subtitle">
            {isLoginMode ? 'Bem-vindo de volta' : 'Crie sua conta gratuita'}
          </p>
        </div>

        <div className="login-tabs">
          <button
            type="button"
            onClick={() => { setIsLoginMode(true); setError(null); setSuccess(null) }}
            className={`login-tab ${isLoginMode ? 'active' : ''}`}
          >
            Entrar
          </button>
          <button
            type="button"
            onClick={() => { setIsLoginMode(false); setError(null); setSuccess(null) }}
            className={`login-tab ${!isLoginMode ? 'active' : ''}`}
          >
            Criar Conta
          </button>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {!isLoginMode && (
            <div className="login-field anim">
              <label htmlFor="fullName">Como quer ser chamado?</label>
              <input
                id="fullName"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Seu nome"
                autoComplete="name"
                maxLength={60}
              />
            </div>
          )}

          <div className="login-field">
            <label htmlFor="email">E-mail</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@email.com"
              autoComplete="email"
              maxLength={120}
            />
          </div>

          <div className="login-field">
            <label htmlFor="password">Senha</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete={isLoginMode ? 'current-password' : 'new-password'}
              maxLength={72}
            />
          </div>

          {isLoginMode && (
            <button type="button" className="login-forgot" onClick={handleForgotPassword} disabled={loading}>
              Esqueci minha senha
            </button>
          )}

          {error && (
            <div className="login-error">
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{flexShrink:0,marginTop:2}}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="login-success">
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{flexShrink:0,marginTop:2}}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{success}</span>
            </div>
          )}

          <button type="submit" disabled={loading} className="login-submit">
            {loading && <span className="login-spinner" />}
            {loading ? 'Processando...' : isLoginMode ? 'Acessar Dashboard' : 'Criar Conta'}
          </button>
        </form>
      </div>
    </div>
  )
}
