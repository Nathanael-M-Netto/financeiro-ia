'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import {
  IconBrand, IconDashboard, IconReceipt, IconCard, IconSparkles,
  IconLogout, IconMenu, IconClose, IconClock,
} from '@/lib/icons'

const NAV_SECTIONS = [
  {
    label: 'Geral',
    items: [
      { href: '/dashboard', label: 'Visão geral', Icon: IconDashboard },
      { href: '/lancamentos', label: 'Lançamentos', Icon: IconReceipt },
      { href: '/cards', label: 'Cartões', Icon: IconCard },
      { href: '/historico', label: 'Histórico', Icon: IconClock },
    ],
  },
  {
    label: 'Assistente',
    items: [
      { href: '/chat', label: 'Assistente IA', Icon: IconSparkles },
    ],
  },
]

export default function Sidebar({ userName, userEmail }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [open, setOpen] = useState(false)

  const logout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const firstName = userName ? userName.split(' ')[0] : 'Você'
  const initial = (userName || userEmail || 'U').trim().charAt(0).toUpperCase()

  return (
    <>
      <header className="app-mobilebar">
        <button className="app-mobilebar-btn" onClick={() => setOpen(true)} aria-label="Abrir menu"><IconMenu size={20} /></button>
        <div className="app-mobilebar-brand">
          <span className="app-mobilebar-mark"><IconBrand size={15} /></span>
          FinDash
        </div>
      </header>
      <div className={`app-overlay ${open ? 'show' : ''}`} onClick={() => setOpen(false)} />

      <aside className={`app-sidebar ${open ? 'open' : ''}`}>
        <div className="app-brand">
          <div className="app-brand-mark"><IconBrand size={20} /></div>
          <div className="app-brand-text">
            <span className="app-brand-name">FinDash</span>
            <span className="app-brand-sub">Controle financeiro</span>
          </div>
          <button className="app-close-btn" onClick={() => setOpen(false)} aria-label="Fechar menu"><IconClose size={18} /></button>
        </div>

        <nav className="app-nav">
          {NAV_SECTIONS.map((sec) => (
            <div key={sec.label} className="app-nav-group">
              <span className="app-nav-label">{sec.label}</span>
              {sec.items.map(({ href, label, Icon }) => {
                const active = pathname === href || pathname.startsWith(href + '/')
                return (
                  <Link key={href} href={href} className={`app-nav-item ${active ? 'active' : ''}`} onClick={() => setOpen(false)}>
                    <Icon size={18} />
                    <span>{label}</span>
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>

        <div className="app-sidebar-footer">
          <div className="app-user">
            <div className="app-user-avatar">{initial}</div>
            <div className="app-user-meta">
              <span className="app-user-name">{firstName}</span>
              {userEmail && <span className="app-user-email">{userEmail}</span>}
            </div>
          </div>
          <button className="app-logout" onClick={logout}><IconLogout size={15} /> Sair da conta</button>
        </div>
      </aside>
    </>
  )
}
