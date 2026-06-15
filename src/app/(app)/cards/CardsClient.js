'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { formatCurrency } from '@/lib/finance-engine'
import { MONTHS_NAMES } from '@/lib/constants'
import { DEFAULT_CARDS, cardChipStyle } from '@/lib/cards'
import { analyzeAllCards } from '@/lib/card-analysis'
import { IconPlus, IconPencil, IconTrash } from '@/lib/icons'

const EMPTY_FORM = { id: null, name: '', color: '#4d83ff', credit_limit: '', closing_day: '', due_day: '' }

export default function CardsClient({ initialCards, expenses = [], userId, currentMonthIdx = 0 }) {
  const router = useRouter()
  const supabase = createClient()

  const [cards, setCards] = useState(initialCards)

  // Análise no mês atual; editar o limite atualiza a barra na hora.
  const analyzed = useMemo(() => analyzeAllCards(expenses, cards, currentMonthIdx), [expenses, cards, currentMonthIdx])
  const monthLabel = MONTHS_NAMES[currentMonthIdx] || MONTHS_NAMES[0]
  const [form, setForm] = useState(EMPTY_FORM)
  const [showForm, setShowForm] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' })

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type })
    setTimeout(() => setToast({ show: false, message: '', type }), 3500)
  }

  const reload = async () => {
    const { data } = await supabase
      .from('cards').select('*').eq('user_id', userId).order('created_at', { ascending: true })
    if (data) setCards(data)
    router.refresh()
  }

  const openNew = () => { setForm(EMPTY_FORM); setShowForm(true) }

  const openEdit = (c) => {
    setForm({
      id: c.id,
      name: c.name || '',
      color: c.color || '#4d83ff',
      credit_limit: c.credit_limit ?? '',
      closing_day: c.closing_day ?? '',
      due_day: c.due_day ?? '',
    })
    setShowForm(true)
  }

  const toPayload = () => ({
    user_id: userId,
    name: form.name.trim(),
    color: form.color,
    credit_limit: form.credit_limit === '' ? null : Number(form.credit_limit),
    closing_day: form.closing_day === '' ? null : parseInt(form.closing_day, 10),
    due_day: form.due_day === '' ? null : parseInt(form.due_day, 10),
  })

  const save = async () => {
    if (!form.name.trim()) { showToast('Dê um nome ao cartão.', 'error'); return }
    setBusy(true)
    try {
      if (form.id) {
        const { error } = await supabase.from('cards').update(toPayload()).eq('id', form.id)
        if (error) throw error
        showToast('Cartão atualizado.')
      } else {
        const { error } = await supabase.from('cards').insert(toPayload())
        if (error) throw error
        showToast('Cartão adicionado.')
      }
      setShowForm(false)
      setForm(EMPTY_FORM)
      await reload()
    } catch (e) {
      showToast(`Erro: ${e.message}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  const doDelete = async (id) => {
    setBusy(true)
    try {
      const { error } = await supabase.from('cards').delete().eq('id', id)
      if (error) throw error
      setConfirmDelete(null)
      showToast('Cartão removido.')
      await reload()
    } catch (e) {
      showToast(`Erro: ${e.message}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  const addSuggested = async () => {
    setBusy(true)
    try {
      const rows = DEFAULT_CARDS.map(d => ({
        user_id: userId, key: d.key, name: d.name, color: d.color, due_day: d.due_day,
      }))
      const { error } = await supabase.from('cards').insert(rows)
      if (error) throw error
      showToast('Cartões sugeridos adicionados.')
      await reload()
    } catch (e) {
      showToast(`Erro: ${e.message}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  const dayLabel = (d) => (d || d === 0 ? `dia ${d}` : '—')

  return (
    <div className="cards-page">
      <header className="app-topbar">
        <div>
          <h1 className="page-title">Cartões</h1>
          <p className="page-sub">Cadastre limite, fechamento e vencimento para liberar a análise por cartão.</p>
        </div>
        <button className="btn-primary" onClick={openNew}><IconPlus size={16} /> Adicionar cartão</button>
      </header>

      {cards.length === 0 ? (
        <div className="empty-state" style={{ margin: '40px 0' }}>
          <div className="empty-state-title">Nenhum cartão cadastrado</div>
          <div className="empty-state-desc">
            Adicione seus cartões para acompanhar limite e fatura. Você pode começar pelos
            cartões sugeridos e ajustar depois.
          </div>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '18px', flexWrap: 'wrap' }}>
            <button className="btn-ai" onClick={openNew}>+ Adicionar manualmente</button>
            <button className="nav-btn" onClick={addSuggested} disabled={busy}>Adicionar cartões sugeridos</button>
          </div>
        </div>
      ) : (
        <div className="cards-grid">
          {analyzed.map(c => {
            const a = c.analysis
            const pct = a.utilizationPct
            const utilColor = pct == null ? 'var(--info)' : pct >= 80 ? 'var(--neg)' : pct >= 50 ? 'var(--warn)' : 'var(--pos)'
            return (
              <div key={c.id} className="card-tile" style={{ '--tile-accent': c.color || 'var(--info)' }}>
                <div className="card-tile-hd">
                  <span className="card-tile-name" style={cardChipStyle(c.color)}>{c.name}</span>
                  <Link href={`/cards/${c.id}`} className="card-tile-analyze">Ver análise →</Link>
                </div>
                <div className="card-tile-rows">
                  <div className="card-tile-row">
                    <span>Fatura ({monthLabel})</span>
                    <strong>{formatCurrency(a.currentInvoice)}</strong>
                  </div>
                  <div className="card-tile-row">
                    <span>Limite</span>
                    <strong>{c.credit_limit ? formatCurrency(c.credit_limit) : 'Não definido'}</strong>
                  </div>
                  <div className="card-tile-row">
                    <span>Vence / Fecha</span>
                    <strong>{dayLabel(c.due_day)} / {dayLabel(c.closing_day)}</strong>
                  </div>
                </div>

                {pct != null ? (
                  <div className="util-wrap">
                    <div className="util-head">
                      <span>Utilização</span>
                      <strong style={{ color: utilColor }}>{pct.toFixed(0)}%</strong>
                    </div>
                    <div className="util-bar"><div className="util-bar-fill" style={{ width: `${Math.min(100, pct)}%`, background: utilColor }} /></div>
                  </div>
                ) : (
                  <div className="util-hint">Defina o limite para ver a utilização</div>
                )}

                <div className="card-tile-actions">
                  <button className="icon-btn" onClick={() => openEdit(c)}><IconPencil size={14} /> Editar</button>
                  <button className="icon-btn danger" onClick={() => setConfirmDelete(c)}><IconTrash size={14} /> Excluir</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal de adicionar/editar */}
      <div className={`modal-backdrop ${showForm ? 'open' : ''}`}>
        <div className="modal-box">
          <div className="modal-hd">
            <div style={{ fontWeight: 800, fontSize: '.9rem', color: '#fff' }}>
              {form.id ? 'Editar cartão' : 'Novo cartão'}
            </div>
            <button className="modal-close" onClick={() => setShowForm(false)}>✕</button>
          </div>
          <div className="modal-bd">
            <div className="form-group">
              <label className="form-label">Nome do cartão</label>
              <input className="form-input" value={form.name} maxLength={40}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="Ex: Nubank" />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Cor</label>
                <input type="color" className="color-input" value={form.color}
                  onChange={e => setForm({ ...form, color: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Limite (R$)</label>
                <input className="form-input" type="number" min="0" step="0.01" value={form.credit_limit}
                  onChange={e => setForm({ ...form, credit_limit: e.target.value })}
                  placeholder="Ex: 3000" />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Dia de fechamento</label>
                <input className="form-input" type="number" min="1" max="31" value={form.closing_day}
                  onChange={e => setForm({ ...form, closing_day: e.target.value })}
                  placeholder="1–31" />
              </div>
              <div className="form-group">
                <label className="form-label">Dia de vencimento</label>
                <input className="form-input" type="number" min="1" max="31" value={form.due_day}
                  onChange={e => setForm({ ...form, due_day: e.target.value })}
                  placeholder="1–31" />
              </div>
            </div>
          </div>
          <div className="modal-ft">
            <button className="nav-btn" onClick={() => setShowForm(false)}>Cancelar</button>
            <button className="btn-ai" onClick={save} disabled={busy}>
              {busy ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>

      {/* Modal de confirmação de exclusão */}
      <div className={`modal-backdrop ${confirmDelete ? 'open' : ''}`}>
        <div className="modal-box" style={{ maxWidth: '380px' }}>
          <div className="modal-hd">
            <div style={{ fontWeight: 800, fontSize: '.9rem', color: '#fff' }}>Excluir cartão</div>
            <button className="modal-close" onClick={() => setConfirmDelete(null)}>✕</button>
          </div>
          <div className="modal-bd">
            <p style={{ fontSize: '.85rem', color: 'var(--text2)', lineHeight: 1.6 }}>
              Tem certeza que deseja excluir <strong style={{ color: 'var(--text)' }}>{confirmDelete?.name}</strong>?
              As despesas ligadas a ele <strong style={{ color: 'var(--text)' }}>não serão apagadas</strong>, apenas ficarão sem cartão.
            </p>
          </div>
          <div className="modal-ft">
            <button className="nav-btn" onClick={() => setConfirmDelete(null)}>Cancelar</button>
            <button className="btn-ai" style={{ background: 'var(--neg)' }} disabled={busy}
              onClick={() => doDelete(confirmDelete.id)}>
              {busy ? 'Excluindo...' : 'Excluir'}
            </button>
          </div>
        </div>
      </div>

      <div className={`toast ${toast.type} ${toast.show ? 'show' : ''}`}>{toast.message}</div>
    </div>
  )
}
