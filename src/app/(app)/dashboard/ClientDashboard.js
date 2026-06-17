'use client'

import React, { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { computeAll, formatCurrency, monthIdxForDate } from '@/lib/finance-engine'
import { createClient } from '@/lib/supabase-browser'
import { CARD_META, HORIZON, monthBaseName, monthYear } from '@/lib/constants'
import { CATEGORY_META } from '@/lib/categorize'
import { IconChevronLeft, IconChevronRight, IconAlert, IconCheck, IconSparkles } from '@/lib/icons'
import Link from 'next/link'

// Quantos meses mostrar a partir do mês atual (janela rolante).
const WINDOW = 12

// Gráfico de rosca (só o perímetro dividido entre as categorias, centro vazio).
function CategoryDonut({ data, total, selected, onSelect }) {
  const r = 42, sw = 18, circ = 2 * Math.PI * r
  const lens = data.map(d => (total > 0 ? (d.total / total) * circ : 0))
  const offsets = lens.map((_, i) => lens.slice(0, i).reduce((a, b) => a + b, 0))
  return (
    <svg viewBox="0 0 120 120" className="donut" role="img" aria-label="Gastos por categoria">
      <circle cx="60" cy="60" r={r} fill="none" stroke="var(--surface2)" strokeWidth={sw} />
      {data.map((d, i) => {
        const meta = CATEGORY_META[d.key] || CATEGORY_META.outros
        const dash = Math.max(0, lens[i] - 1.5) // pequeno gap entre as fatias
        return (
          <circle
            key={d.key} cx="60" cy="60" r={r} fill="none"
            stroke={meta.color} strokeWidth={selected === d.key ? sw + 4 : sw}
            strokeDasharray={`${dash} ${circ - dash}`} strokeDashoffset={-offsets[i]}
            transform="rotate(-90 60 60)" strokeLinecap="butt"
            style={{ cursor: 'pointer', transition: 'stroke-width .15s' }}
            onClick={() => onSelect(d.key)}
          />
        )
      })}
    </svg>
  )
}

export default function ClientDashboard({ initialExpenses, initialIncome }) {
  // A data real só é lida no cliente, após montar — assim o HTML do servidor e o
  // primeiro render do cliente são idênticos (sem divergência de hidratação).
  const [today, setToday] = useState(null)
  const [currentMonth, setCurrentMonth] = useState(0)
  const [realMonth, setRealMonth] = useState(0) // mês de hoje; abas só mostram daqui pra frente
  const [selectedCat, setSelectedCat] = useState(null) // categoria aberta no drilldown
  const [showDetails, setShowDetails] = useState(false) // no mobile, esconde gráficos/detalhes atrás de "Ver detalhes"

  useEffect(() => {
    const t = new Date()
    const idx = monthIdxForDate(t)
    /* eslint-disable react-hooks/set-state-in-effect */
    setToday(t)
    setCurrentMonth(idx)
    setRealMonth(idx)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [])

  const metrics = useMemo(
    () => computeAll(initialExpenses, initialIncome, today),
    [initialExpenses, initialIncome, today]
  )
  const currentMetric = metrics[currentMonth]
  const todayDay = today ? today.getDate() : null

  // Janela rolante: do mês atual em diante, no máximo WINDOW meses.
  const windowMetrics = useMemo(
    () => metrics.filter(m => m.idx >= realMonth).slice(0, WINDOW),
    [metrics, realMonth]
  )
  const lastWindow = windowMetrics[windowMetrics.length - 1] || metrics[metrics.length - 1]
  const windowEndIdx = lastWindow.idx
  const lastBalance = lastWindow.balance
  const negativeMonths = windowMetrics.filter(m => m.balance < 0).length
  const hasData = initialExpenses.length > 0 || initialIncome.length > 0

  const router = useRouter()
  const supabase = createClient()
  const [paidBusy, setPaidBusy] = useState(false)

  // Marca/desmarca uma despesa como paga no mês visualizado (paid_through).
  const togglePaid = async (item) => {
    if (paidBusy || !item.id) return
    setPaidBusy(true)
    const newVal = item.isPaid ? (currentMonth > 0 ? currentMonth - 1 : null) : currentMonth
    await supabase.from('expenses').update({ paid_through: newVal }).eq('id', item.id)
    router.refresh()
    setPaidBusy(false)
  }

  const alertIcon = (type) => (type === 'pos' ? <IconCheck size={16} /> : <IconAlert size={16} />)

  // Escala do gráfico de tendência (maior saldo absoluto na janela visível).
  const trendMaxAbs = useMemo(
    () => Math.max(1, ...windowMetrics.map(m => Math.abs(m.balance))),
    [windowMetrics]
  )

  // Gastos agrupados por cartão no mês selecionado.
  const byCard = useMemo(() => {
    const map = {}
    currentMetric.expensesList.forEach(e => {
      if (!map[e.cardName]) map[e.cardName] = { name: e.cardName, cardId: e.cardId, total: 0 }
      map[e.cardName].total += e.amount
    })
    const arr = Object.values(map).sort((a, b) => b.total - a.total)
    const total = arr.reduce((s, c) => s + c.total, 0)
    return { arr, total }
  }, [currentMetric])

  // Gastos agrupados por categoria no mês selecionado.
  const byCategory = useMemo(() => {
    const map = {}
    currentMetric.expensesList.forEach(e => {
      const key = e.category || 'outros'
      if (!map[key]) map[key] = { key, total: 0 }
      map[key].total += e.amount
    })
    const arr = Object.values(map).sort((a, b) => b.total - a.total)
    const total = arr.reduce((s, c) => s + c.total, 0)
    return { arr, total }
  }, [currentMetric])

  return (
    <div className={`page anim ${showDetails ? '' : 'mobile-collapsed'}`}>
      <header className="app-topbar">
        <div>
          <h1 className="page-title">{monthBaseName(currentMonth)} <span className="page-title-year">{monthYear(currentMonth)}</span></h1>
          <p className="page-sub">Sua projeção financeira do mês</p>
        </div>
        <div className="month-stepper">
          <button className="icon-btn-sq" disabled={currentMonth <= realMonth} onClick={() => setCurrentMonth(m => Math.max(realMonth, m - 1))} aria-label="Mês anterior"><IconChevronLeft size={18} /></button>
          <button className="icon-btn-sq" disabled={currentMonth >= windowEndIdx} onClick={() => setCurrentMonth(m => Math.min(windowEndIdx, m + 1))} aria-label="Próximo mês"><IconChevronRight size={18} /></button>
        </div>
      </header>

      {/* Primeira vez: passo a passo enquanto não há lançamentos */}
      {!hasData && (
        <section className="onboarding">
          <div className="onb-head">
            <div className="onb-badge"><IconSparkles size={20} /></div>
            <div>
              <h2 className="onb-title">Bem-vindo ao FinDash 👋</h2>
              <p className="onb-sub">Monte seu controle em 3 passos rápidos. Leva 2 minutos.</p>
            </div>
          </div>
          <div className="onb-steps">
            <Link className="onb-step" href="/cards">
              <span className="onb-num">1</span>
              <div className="onb-step-txt">
                <strong>Cadastre seus cartões</strong>
                <span>Limite, dia de fechamento e de vencimento.</span>
              </div>
            </Link>
            <Link className="onb-step" href="/lancamentos">
              <span className="onb-num">2</span>
              <div className="onb-step-txt">
                <strong>Lance uma despesa ou receita</strong>
                <span>Pix, cartão, salário… a fatura é calculada sozinha.</span>
              </div>
            </Link>
            <Link className="onb-step" href="/chat">
              <span className="onb-num">3</span>
              <div className="onb-step-txt">
                <strong>Ou só peça pra IA</strong>
                <span>“Gastei 50 no Pix hoje no mercado.”</span>
              </div>
            </Link>
          </div>
        </section>
      )}

      {/* Seletor de meses em abas */}
      {hasData && (
      <div className="month-tabs">
        {windowMetrics.map((m) => (
          <button key={m.idx} className={`month-tab ${currentMonth === m.idx ? 'active' : ''} ${m.isCurrent ? 'is-current' : ''}`} onClick={() => setCurrentMonth(m.idx)}>
            <span className="month-tab-name">{m.monthName}{m.isCurrent && <span className="month-tab-today">hoje</span>}</span>
            <span className="month-tab-bal" style={{ color: m.balance >= 0 ? 'var(--pos)' : 'var(--neg)' }}>{formatCurrency(m.balance)}</span>
          </button>
        ))}
      </div>
      )}

      {/* Grana atual em destaque, no topo (compacto) */}
      {hasData && currentMetric.isCurrent && (
        <div className="grana-top">
          <div className="grana-top-main">
            <span className="grana-top-label">Grana atual — agora</span>
            <span className="grana-top-val">{formatCurrency(currentMetric.saldoAtual)}</span>
          </div>
          {currentMetric.pendingPay > 0
            ? <span className="grana-top-sub">ainda falta pagar {formatCurrency(currentMetric.pendingPay)} este mês</span>
            : <span className="grana-top-sub ok">tudo deste mês está pago</span>}
        </div>
      )}

      {/* Resumo essencial (só mobile) */}
      {hasData && (
      <div className="mobile-summary">
        {currentMetric.isCurrent && (
          <div className="ms-item"><span>Grana atual</span><strong className="ms-pos">{formatCurrency(currentMetric.saldoAtual)}</strong></div>
        )}
        <div className="ms-item"><span>Falta pagar</span><strong className="ms-warn">{formatCurrency(currentMetric.pendingPay)}</strong></div>
        <div className="ms-item"><span>Saldo fim do mês</span><strong style={{ color: currentMetric.balance >= 0 ? 'var(--pos)' : 'var(--neg)' }}>{formatCurrency(currentMetric.balance)}</strong></div>
      </div>
      )}
      {hasData && (<>
      <button className="dash-details-toggle" onClick={() => setShowDetails(v => !v)}>
        {showDetails ? 'Ocultar detalhes ▲' : 'Ver detalhes (gráficos, linha do tempo) ▼'}
      </button>

      {/* Resumo anual */}
      <div className="annual-strip dash-detail">
        <div className="annual-item">
          <span>Saldo projetado em {lastWindow.monthName}</span>
          <strong style={{ color: lastBalance >= 0 ? 'var(--pos)' : 'var(--neg)' }}>{formatCurrency(lastBalance)}</strong>
        </div>
        <div className="annual-divider" />
        <div className="annual-item">
          <span>Meses no negativo</span>
          <strong style={{ color: negativeMonths > 0 ? 'var(--warn)' : 'var(--pos)' }}>{negativeMonths}</strong>
        </div>
      </div>

      <section className="kpi-grid dash-detail">
        <div className="kpi-card" style={{ '--kpi-accent': 'var(--pos)' }}>
          <div className="kpi-label">Total de entradas</div>
          <div className="kpi-value" style={{ color: 'var(--pos)' }}>{formatCurrency(currentMetric.totalIn)}</div>
        </div>
        <div className="kpi-card" style={{ '--kpi-accent': 'var(--neg)' }}>
          <div className="kpi-label">Total de saídas</div>
          <div className="kpi-value" style={{ color: 'var(--neg)' }}>{formatCurrency(currentMetric.totalOut)}</div>
        </div>
        <div className="kpi-card" style={{ '--kpi-accent': currentMetric.balance >= 0 ? 'var(--pos)' : 'var(--neg)' }}>
          <div className="kpi-label">Saldo líquido</div>
          <div className="kpi-value" style={{ color: currentMetric.balance >= 0 ? 'var(--pos)' : 'var(--neg)' }}>
            {currentMetric.balance > 0 ? '+' : ''}{formatCurrency(currentMetric.balance)}
          </div>
          <div className="kpi-sub">Transporta para o próximo mês</div>
        </div>
        <div className="kpi-card" style={{ '--kpi-accent': 'var(--info)' }}>
          <div className="kpi-label">Itens ativos</div>
          <div className="kpi-value" style={{ color: 'var(--info)' }}>{currentMetric.activeCardsCount}</div>
          <div className="kpi-sub">cartões ou itens no mês</div>
        </div>
      </section>
      </>)}

      {hasData && (
        <section className="dash-grid dash-detail">
          <div className="card chart-card">
            <div className="card-body">
              <div className="timeline-title">Tendência do saldo — próximos {windowMetrics.length} meses</div>
              <div className="trend-chart">
                {windowMetrics.map((m) => {
                  const v = m.balance
                  const h = Math.round((Math.abs(v) / trendMaxAbs) * 100)
                  const pos = v >= 0
                  return (
                    <button key={m.idx} className={`trend-col ${currentMonth === m.idx ? 'active' : ''}`} onClick={() => setCurrentMonth(m.idx)} title={`${m.monthName}: ${formatCurrency(v)}`}>
                      <div className="trend-top"><div className="trend-bar pos" style={{ height: pos ? `${h}%` : '0%' }} /></div>
                      <div className="trend-mid" />
                      <div className="trend-bot"><div className="trend-bar neg" style={{ height: !pos ? `${h}%` : '0%' }} /></div>
                      <span className="trend-lbl">{monthBaseName(m.idx).slice(0, 3)}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="card chart-card">
            <div className="card-body">
              <div className="timeline-title">Gastos por cartão — {currentMetric.monthName}</div>
              {byCard.arr.length === 0 ? (
                <div className="chart-empty">Nenhuma despesa neste mês.</div>
              ) : (
                <div className="bycard-list">
                  {byCard.arr.map((c, i) => {
                    const color = CARD_META[c.cardId]?.cssVar || '#4d83ff'
                    const pctTotal = byCard.total > 0 ? (c.total / byCard.total) * 100 : 0
                    return (
                      <div key={i} className="bycard-row">
                        <div className="bycard-head">
                          <span className="bycard-name">{c.name}</span>
                          <span className="bycard-val">{formatCurrency(c.total)} · {pctTotal.toFixed(0)}%</span>
                        </div>
                        <div className="bycard-bar"><div className="bycard-fill" style={{ width: `${pctTotal}%`, background: color }} /></div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="card chart-card">
            <div className="card-body">
              <div className="timeline-title">Gastos por categoria — {currentMetric.monthName}</div>
              {byCategory.arr.length === 0 ? (
                <div className="chart-empty">Nenhuma despesa neste mês.</div>
              ) : (
                <>
                  <div className="cat-chart">
                    <CategoryDonut data={byCategory.arr} total={byCategory.total} selected={selectedCat} onSelect={(k) => setSelectedCat(s => (s === k ? null : k))} />
                    <div className="cat-legend">
                      {byCategory.arr.map((c) => {
                        const meta = CATEGORY_META[c.key] || CATEGORY_META.outros
                        const pct = byCategory.total > 0 ? (c.total / byCategory.total) * 100 : 0
                        return (
                          <button key={c.key} className={`cat-leg ${selectedCat === c.key ? 'on' : ''}`} onClick={() => setSelectedCat(s => (s === c.key ? null : c.key))}>
                            <span className="cat-dot" style={{ background: meta.color }} />
                            <span className="cat-leg-name">{meta.name}</span>
                            <span className="cat-leg-val">{pct.toFixed(0)}%</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  {selectedCat && (
                    <div className="cat-drill">
                      <div className="cat-drill-hd">
                        <span>{(CATEGORY_META[selectedCat] || CATEGORY_META.outros).name}</span>
                        <strong>{formatCurrency(byCategory.arr.find(c => c.key === selectedCat)?.total || 0)}</strong>
                      </div>
                      {currentMetric.expensesList.filter(e => (e.category || 'outros') === selectedCat).map((e, i) => (
                        <div key={i} className="cat-drill-row">
                          <span>{e.desc}<span className="cat-drill-card"> · {e.cardName}</span></span>
                          <span>{formatCurrency(e.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </section>
      )}

      {hasData && (
      <section className="timeline-card dash-detail">
        <div className="timeline-head">
          <div className="timeline-title" style={{ marginBottom: 0 }}>Linha do tempo — {currentMetric.monthName}</div>
          {currentMetric.isCurrent && todayDay && <span className="today-chip">Hoje · dia {todayDay}</span>}
        </div>
        <div className="timeline-scroll">
          <div className="timeline-events">
            {currentMetric.timelineEvents.length === 0 && (
              <div style={{ color: 'var(--text2)', fontSize: '.8rem', padding: '4px 0' }}>Nenhum evento neste mês.</div>
            )}
            {currentMetric.timelineEvents.map((ev, i) => {
              const isOut = ev.type === 'expense' || ev.type === 'late'
              return (
                <div key={i} className={`tl-ev ${ev.type} st-${ev.status}`}>
                  <div className="tl-day">DIA {ev.day}</div>
                  <div className="tl-label">{ev.label}</div>
                  <div className={`tl-amount ${ev.type}`}>{formatCurrency(ev.amount)}</div>
                  {ev.status === 'paid' && isOut && <span className="tl-tag tl-tag-paid">✓ pago</span>}
                  {ev.status === 'today' && <span className="tl-tag tl-tag-today">vence hoje</span>}
                  {ev.status === 'upcoming' && isOut && <span className="tl-tag tl-tag-up">a vencer</span>}
                  {ev.status === 'past' && isOut && ev.daysLate > 0 && <span className="tl-tag tl-tag-past">venceu há {ev.daysLate}d</span>}
                  {ev.lateEstimate > 0 && <span className="tl-late-est">+{formatCurrency(ev.lateEstimate)} se atrasar</span>}
                  {ev.lateLabel && <span className="tl-late-tag">ATRASO</span>}
                </div>
              )
            })}
          </div>
        </div>
      </section>
      )}

      {currentMetric.isCurrent && (currentMetric.pendingPay > 0 || currentMetric.overdueAmount > 0) && (
        <div className="pay-summary">
          <div className="pay-item">
            <span>Falta pagar este mês</span>
            <strong style={{ color: 'var(--warn)' }}>{formatCurrency(currentMetric.pendingPay)}</strong>
          </div>
          {currentMetric.overdueAmount > 0 && (
            <>
              <div className="pay-divider" />
              <div className="pay-item">
                <span>Já passou do vencimento</span>
                <strong style={{ color: 'var(--neg)' }}>{formatCurrency(currentMetric.overdueAmount)}</strong>
              </div>
              <div className="pay-divider" />
              <div className="pay-item">
                <span>Encargos estimados se não pago</span>
                <strong style={{ color: 'var(--neg)' }}>+{formatCurrency(currentMetric.overdueCharge)}</strong>
              </div>
            </>
          )}
        </div>
      )}

      {currentMetric.alerts && currentMetric.alerts.map((alert, i) => (
        <div key={i} className={`alert alert-${alert.type}`}>
          <span className="alert-ico">{alertIcon(alert.type)}</span>
          <span>{alert.text}</span>
        </div>
      ))}

      {hasData && (
        <section className="month-panel dash-detail">
          <div>
            <div className="card">
              <div className="card-header">
                <span className="timeline-title" style={{ marginBottom: 0 }}>Despesas detalhadas — {currentMetric.monthName}</span>
                <span className="hero-negative" style={{ fontSize: '.9rem', fontWeight: 800 }}>{formatCurrency(currentMetric.totalOut)}</span>
              </div>
              <div className="card-body">
                {Array.from(new Set(currentMetric.expensesList.map(e => e.cardName))).map(cardName => {
                  const cardItems = currentMetric.expensesList.filter(e => e.cardName === cardName)
                  const cardTotal = cardItems.reduce((acc, curr) => acc + curr.amount, 0)
                  const meta = CARD_META[cardItems[0].cardId] || CARD_META.extra

                  return (
                    <div className="card-group" key={cardName}>
                      <div className="card-group-hd">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span className={`tag ${meta.tagClass}`}>{meta.name}</span>
                          <span style={{ fontSize: '.68rem', color: 'var(--text2)' }}>Vencimento dia {cardItems[0].payDay}</span>
                        </div>
                        <span className="hero-negative" style={{ fontSize: '.8rem', fontWeight: 700 }}>{formatCurrency(cardTotal)}</span>
                      </div>
                      <table className="exp-table">
                        <thead>
                          <tr>
                            <th>Descrição</th>
                            <th className="align-center" style={{ textAlign: 'center' }}>Parcela</th>
                            <th className="align-right">Valor</th>
                            <th className="align-center" style={{ textAlign: 'center' }}>Pago</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cardItems.map((item, idx) => (
                            <tr key={idx} className={item.isPaid ? 'row-paid' : ''}>
                              <td>{item.desc}</td>
                              <td style={{ textAlign: 'center' }}><span className="inst-badge">{item.instStr}</span></td>
                              <td className="amt-col">{formatCurrency(item.amount)}</td>
                              <td style={{ textAlign: 'center' }}>
                                <button className={`pay-toggle ${item.isPaid ? 'on' : ''}`} onClick={() => togglePaid(item)} disabled={paidBusy} aria-label={item.isPaid ? 'Desmarcar pago' : 'Marcar como pago'} title={item.isPaid ? 'Pago — clique para desmarcar' : 'Marcar como pago'}>
                                  {item.isPaid ? <IconCheck size={13} /> : ''}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                })}
                {currentMetric.expensesList.length === 0 && (
                  <div style={{ textAlign: 'center', color: 'var(--text2)', fontSize: '.8rem', padding: '16px 0' }}>Nenhuma despesa neste mês.</div>
                )}
              </div>
            </div>
          </div>

          <div className="summary-col">
            <div className={`balance-hero ${currentMetric.balance >= 0 ? 'positive' : 'negative'}`}>
              <div className="hero-label">Saldo efetivo — fim do mês</div>
              <div className={`hero-value ${currentMetric.balance >= 0 ? 'hero-positive' : 'hero-negative'}`}>{formatCurrency(currentMetric.balance)}</div>
            </div>

            <div className="totals-table">
              <table>
                <tbody>
                  <tr className="totals-row-in">
                    <td>Entradas do mês</td>
                    <td className="hero-positive">{formatCurrency(currentMetric.totalIn)}</td>
                  </tr>
                  {currentMetric.incomeList.map((inc, i) => (
                    <tr key={`inc-${i}`}>
                      <td style={{ paddingLeft: '24px', fontSize: '.75rem' }}>• {inc.label}</td>
                      <td className="hero-positive">{formatCurrency(inc.amount)}</td>
                    </tr>
                  ))}
                  <tr className="totals-row-out">
                    <td>Saídas do mês</td>
                    <td className="hero-negative">{formatCurrency(currentMetric.totalOut)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
