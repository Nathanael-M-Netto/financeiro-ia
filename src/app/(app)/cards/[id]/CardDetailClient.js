'use client'

import { useState } from 'react'
import Link from 'next/link'
import { formatCurrency } from '@/lib/finance-engine'
import { MONTHS_NAMES } from '@/lib/constants'
import { analyzeCard } from '@/lib/card-analysis'
import { cardChipStyle } from '@/lib/cards'
import { createClient } from '@/lib/supabase-browser'
import { IconCheck, IconChevronLeft } from '@/lib/icons'

export default function CardDetailClient({ card, expenses, currentMonthIdx }) {
  const supabase = createClient()
  // Mês selecionado no gráfico (clicável) — abre no mês atual.
  const [selMonth, setSelMonth] = useState(currentMonthIdx)
  const [localExpenses, setLocalExpenses] = useState(expenses)
  const [payBusy, setPayBusy] = useState(false)
  const [payError, setPayError] = useState(null)

  const a = analyzeCard(localExpenses, card, currentMonthIdx)
  const pct = a.utilizationPct
  const utilColor = pct == null ? 'var(--info)' : pct >= 80 ? 'var(--neg)' : pct >= 50 ? 'var(--warn)' : 'var(--pos)'

  const selInvoice = a.months[selMonth] || 0

  // Despesas ATIVAS no mês selecionado (com a parcela daquele mês).
  const selExpenses = a.cardExpenses
    .map(e => {
      const start = e.start_month || 0
      const total = e.total_installments || 1
      const active = e.is_recurring ? selMonth >= start : (selMonth >= start && selMonth < start + total)
      if (!active) return null
      const inst = e.is_fee ? '—' : (e.is_recurring ? 'Fixa' : `${selMonth - start + (e.installment_offset ?? 1)}/${total}`)
      const isPaid = e.paid_through != null && selMonth <= e.paid_through
      return { ...e, instLabel: inst, isPaid }
    })
    .filter(Boolean)

  const invoicePaid = selExpenses.length > 0 && selExpenses.every(expense => expense.isPaid)

  const setInvoicePaid = async () => {
    if (payBusy || !selExpenses.length) return
    const ids = selExpenses.map(expense => expense.id).filter(Boolean)
    const nextPaidThrough = invoicePaid ? (selMonth > 0 ? selMonth - 1 : null) : selMonth
    const before = new Map(localExpenses.filter(expense => ids.includes(expense.id)).map(expense => [expense.id, expense.paid_through]))
    setPayBusy(true)
    setPayError(null)
    setLocalExpenses(prev => prev.map(expense => ids.includes(expense.id) ? { ...expense, paid_through: nextPaidThrough } : expense))
    const { data: { session } } = await supabase.auth.getSession()
    let query = supabase.from('expenses').update({ paid_through: nextPaidThrough }).in('id', ids)
    if (session?.user?.id) query = query.eq('user_id', session.user.id)
    const { error } = await query
    if (error) {
      setLocalExpenses(prev => prev.map(expense => before.has(expense.id) ? { ...expense, paid_through: before.get(expense.id) } : expense))
      setPayError('Não consegui salvar o pagamento. O estado anterior foi restaurado.')
    }
    setPayBusy(false)
  }

  return (
    <div className="page legacy-page card-detail-page anim">
      <header className="app-topbar legacy-topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
          <Link href="/cards" className="btn-ghost"><IconChevronLeft size={14} /> Cartões</Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span className="card-tile-name" style={{ ...cardChipStyle(card.color), fontSize: '.85rem' }}>{card.name}</span>
            <div style={{ fontSize: '.72rem', color: 'var(--text2)' }}>
              {card.closing_day ? `Fecha dia ${card.closing_day}` : 'Fechamento não definido'} ·{' '}
              {card.due_day ? `Vence dia ${card.due_day}` : 'Vencimento não definido'}
            </div>
          </div>
        </div>
      </header>

      {/* KPIs */}
      <section className="legacy-overview">
        <div className="legacy-kpi negative">
          <span>Fatura — {MONTHS_NAMES[selMonth] || '—'}</span>
          <strong>{formatCurrency(selInvoice)}</strong>
          {selMonth !== currentMonthIdx && <small>Período selecionado no gráfico</small>}
        </div>
        <div className="legacy-kpi">
          <span>Utilização do limite</span>
          <strong style={{ color: utilColor }}>{pct == null ? '—' : `${pct.toFixed(0)}%`}</strong>
          <small>{a.limit ? `Limite ${formatCurrency(a.limit)}` : 'Defina o limite do cartão'}</small>
        </div>
        <div className="legacy-kpi">
          <span>Melhor dia de compra</span>
          <strong style={{ color: 'var(--info)' }}>{a.bestBuyDay ? `Dia ${a.bestBuyDay}` : '—'}</strong>
          <small>{a.bestBuyDay ? 'Logo após o fechamento' : 'Defina o dia de fechamento'}</small>
        </div>
        <div className="legacy-kpi">
          <span>Total a pagar</span>
          <strong style={{ color: 'var(--warn)' }}>{formatCurrency(a.remaining)}</strong>
          <small>{a.openPlansCount} parcelamento(s) em aberto</small>
        </div>
      </section>

      {a.overLimit && (
        <div className="alert alert-neg" style={{ marginBottom: '14px' }}>
          A fatura projetada estoura o limite em <strong>{a.peakMonthName}</strong> ({formatCurrency(a.peakInvoice)} de {formatCurrency(a.limit)}). Considere antecipar pagamentos ou reduzir compras neste cartão.
        </div>
      )}

      {/* Utilização */}
      {pct != null && (
        <section className="card" style={{ marginBottom: '22px' }}>
          <div className="card-body">
            <div className="util-head" style={{ marginBottom: '10px' }}>
              <span className="timeline-title" style={{ marginBottom: 0 }}>Utilização do limite</span>
              <strong style={{ color: utilColor, fontSize: '.95rem' }}>{pct.toFixed(0)}%</strong>
            </div>
            <div className="util-bar"><div className="util-bar-fill" style={{ width: `${Math.min(100, pct)}%`, background: utilColor }} /></div>
            <div style={{ fontSize: '.72rem', color: 'var(--text2)', marginTop: '8px' }}>
              {formatCurrency(a.remaining)} ainda a pagar de {formatCurrency(a.limit)} de limite (faturas pagas liberam o limite).
            </div>
          </div>
        </section>
      )}

      {/* Gráfico mensal — clicável */}
      <section className="card" style={{ marginBottom: '22px' }}>
        <div className="card-body">
          <div className="timeline-title">Fatura por mês — toque para ver o detalhe</div>
          <div className="month-chart">
            {a.months.slice(currentMonthIdx, currentMonthIdx + 12).map((v, j) => {
              const i = currentMonthIdx + j
              const h = v === 0 ? 0 : Math.max(6, Math.round((v / (a.peakInvoice || 1)) * 100))
              const isSel = i === selMonth
              return (
                <button key={i} className={`month-bar-col month-bar-btn ${isSel ? 'sel' : ''}`}
                  onClick={() => setSelMonth(i)} title={`${MONTHS_NAMES[i]}: ${formatCurrency(v)}`}>
                  <div className="month-bar-val">{v > 0 ? formatCurrency(v) : ''}</div>
                  <div className="month-bar-track">
                    <div className="month-bar-fill" style={{ height: `${h}%`, background: card.color || 'var(--info)', opacity: isSel ? 1 : 0.45 }} />
                  </div>
                  <div className="month-bar-label" style={isSel ? { color: 'var(--text)' } : undefined}>{MONTHS_NAMES[i].slice(0, 3)}</div>
                </button>
              )
            })}
          </div>
        </div>
      </section>

      {/* Despesas do cartão NO MÊS selecionado */}
      <section className="card">
        <div className="card-header">
          <span className="timeline-title" style={{ marginBottom: 0 }}>Fatura de {MONTHS_NAMES[selMonth]}</span>
          <div className="invoice-detail-actions">
            <span className="hero-negative">{formatCurrency(selInvoice)}</span>
            {selExpenses.length > 0 && (
              <button className={`invoice-pay-btn ${invoicePaid ? 'paid' : ''}`} onClick={setInvoicePaid} disabled={payBusy}>
                <span className={`pay-toggle ${invoicePaid ? 'on' : ''}`}>{invoicePaid ? <IconCheck size={13} /> : ''}</span>
                {payBusy ? 'Salvando…' : invoicePaid ? 'Fatura paga' : 'Marcar fatura paga'}
              </button>
            )}
          </div>
        </div>
        <div className="card-body">
          {payError && <div className="form-hint hint-warn invoice-pay-error">{payError}</div>}
          {selExpenses.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text2)', fontSize: '.82rem', padding: '16px 0' }}>
              Nada na fatura de {MONTHS_NAMES[selMonth]}.
            </div>
          ) : (
            <table className="exp-table">
              <thead>
                <tr>
                  <th>Descrição</th>
                  <th className="align-center" style={{ textAlign: 'center' }}>Parcela</th>
                  <th className="align-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {selExpenses.map((e) => (
                  <tr key={e.id} className={e.isPaid ? 'row-paid' : ''}>
                    <td><span className="invoice-item-name">{e.is_fee ? 'Juros/Multa' : (e.description || 'Despesa')}{e.isPaid && <span className="invoice-paid-icon"><IconCheck size={13} aria-hidden="true" /><span className="sr-only">Pago</span></span>}</span></td>
                    <td style={{ textAlign: 'center' }}><span className="inst-badge">{e.instLabel}</span></td>
                    <td className="amt-col">{formatCurrency(parseFloat(e.amount) || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  )
}
