import { createClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { formatCurrency } from '@/lib/finance-engine'
import { MONTHS_NAMES } from '@/lib/constants'
import { analyzeCard } from '@/lib/card-analysis'
import { cardChipStyle } from '@/lib/cards'

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

  const a = analyzeCard(expenses || [], card, 0)
  const pct = a.utilizationPct
  const utilColor = pct == null ? 'var(--info)' : pct >= 80 ? 'var(--neg)' : pct >= 50 ? 'var(--warn)' : 'var(--pos)'

  return (
    <div className="cards-page">
      <header className="app-topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
          <Link href="/cards" className="btn-ghost">← Cartões</Link>
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
      <section className="kpi-grid">
        <div className="kpi-card" style={{ '--kpi-accent': 'var(--neg)' }}>
          <div className="kpi-label">Fatura — Abril</div>
          <div className="kpi-value" style={{ color: 'var(--neg)' }}>{formatCurrency(a.currentInvoice)}</div>
        </div>
        <div className="kpi-card" style={{ '--kpi-accent': utilColor }}>
          <div className="kpi-label">Utilização do limite</div>
          <div className="kpi-value" style={{ color: utilColor }}>{pct == null ? '—' : `${pct.toFixed(0)}%`}</div>
          <div className="kpi-sub">{a.limit ? `Limite ${formatCurrency(a.limit)}` : 'Defina o limite do cartão'}</div>
        </div>
        <div className="kpi-card" style={{ '--kpi-accent': 'var(--info)' }}>
          <div className="kpi-label">Melhor dia de compra</div>
          <div className="kpi-value" style={{ color: 'var(--info)' }}>{a.bestBuyDay ? `Dia ${a.bestBuyDay}` : '—'}</div>
          <div className="kpi-sub">{a.bestBuyDay ? 'Logo após o fechamento' : 'Defina o dia de fechamento'}</div>
        </div>
        <div className="kpi-card" style={{ '--kpi-accent': 'var(--warn)' }}>
          <div className="kpi-label">Total a pagar (restante)</div>
          <div className="kpi-value" style={{ color: 'var(--warn)' }}>{formatCurrency(a.remaining)}</div>
          <div className="kpi-sub">{a.openPlansCount} parcelamento(s) em aberto</div>
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
              {formatCurrency(a.currentInvoice)} comprometidos de {formatCurrency(a.limit)} de limite.
            </div>
          </div>
        </section>
      )}

      {/* Gráfico mensal */}
      <section className="card" style={{ marginBottom: '22px' }}>
        <div className="card-body">
          <div className="timeline-title">Fatura por mês — Abril a Dezembro</div>
          <div className="month-chart">
            {a.months.map((v, i) => {
              const h = v === 0 ? 0 : Math.max(6, Math.round((v / (a.peakInvoice || 1)) * 100))
              const isPeak = i === a.peakMonthIdx && v > 0
              return (
                <div key={i} className="month-bar-col" title={`${MONTHS_NAMES[i]}: ${formatCurrency(v)}`}>
                  <div className="month-bar-val">{v > 0 ? formatCurrency(v) : ''}</div>
                  <div className="month-bar-track">
                    <div className="month-bar-fill" style={{ height: `${h}%`, background: card.color || 'var(--info)', opacity: isPeak ? 1 : 0.55 }} />
                  </div>
                  <div className="month-bar-label">{MONTHS_NAMES[i].slice(0, 3)}</div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Despesas do cartão */}
      <section className="card">
        <div className="card-header">
          <span className="timeline-title" style={{ marginBottom: 0 }}>Despesas neste cartão</span>
        </div>
        <div className="card-body">
          {a.cardExpenses.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text2)', fontSize: '.82rem', padding: '16px 0' }}>
              Nenhuma despesa cadastrada neste cartão.
            </div>
          ) : (
            <table className="exp-table">
              <thead>
                <tr>
                  <th>Descrição</th>
                  <th>Início</th>
                  <th className="align-center" style={{ textAlign: 'center' }}>Parcelas</th>
                  <th className="align-right">Valor/mês</th>
                </tr>
              </thead>
              <tbody>
                {a.cardExpenses.map((e) => (
                  <tr key={e.id}>
                    <td>{e.is_fee ? 'Juros/Multa' : (e.description || 'Despesa')}</td>
                    <td>{MONTHS_NAMES[e.start_month] || '—'}</td>
                    <td style={{ textAlign: 'center' }}><span className="inst-badge">{e.is_fee ? '—' : `${e.total_installments}x`}</span></td>
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
