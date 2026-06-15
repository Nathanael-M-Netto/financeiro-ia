'use client'

import React, { useState, useMemo } from 'react'
import { computeAll, formatCurrency, monthIdxForDate } from '@/lib/finance-engine'
import { CARD_META } from '@/lib/constants'
import { IconChevronLeft, IconChevronRight, IconAlert, IconCheck } from '@/lib/icons'

export default function ClientDashboard({ initialExpenses, initialIncome }) {
  // Abre direto no mês atual real (ex.: hoje é Junho → índice 2).
  const [currentMonth, setCurrentMonth] = useState(() => monthIdxForDate())

  const metrics = useMemo(
    () => computeAll(initialExpenses, initialIncome, new Date()),
    [initialExpenses, initialIncome]
  )
  const currentMetric = metrics[currentMonth]
  const todayDay = new Date().getDate()
  const lastBalance = metrics[metrics.length - 1].balance
  const negativeMonths = metrics.filter(m => m.balance < 0).length
  const hasData = initialExpenses.length > 0 || initialIncome.length > 0

  const alertIcon = (type) => (type === 'pos' ? <IconCheck size={16} /> : <IconAlert size={16} />)

  return (
    <div className="page anim">
      <header className="app-topbar">
        <div>
          <h1 className="page-title">{currentMetric.monthName} <span className="page-title-year">2026</span></h1>
          <p className="page-sub">Sua projeção financeira do mês</p>
        </div>
        <div className="month-stepper">
          <button className="icon-btn-sq" disabled={currentMonth === 0} onClick={() => setCurrentMonth(m => Math.max(0, m - 1))} aria-label="Mês anterior"><IconChevronLeft size={18} /></button>
          <button className="icon-btn-sq" disabled={currentMonth === 8} onClick={() => setCurrentMonth(m => Math.min(8, m + 1))} aria-label="Próximo mês"><IconChevronRight size={18} /></button>
        </div>
      </header>

      {/* Seletor de meses em abas */}
      <div className="month-tabs">
        {metrics.map((m, i) => (
          <button key={i} className={`month-tab ${currentMonth === i ? 'active' : ''} ${m.isCurrent ? 'is-current' : ''}`} onClick={() => setCurrentMonth(i)}>
            <span className="month-tab-name">{m.monthName}{m.isCurrent && <span className="month-tab-today">hoje</span>}</span>
            <span className="month-tab-bal" style={{ color: m.balance >= 0 ? 'var(--pos)' : 'var(--neg)' }}>{formatCurrency(m.balance)}</span>
          </button>
        ))}
      </div>

      {/* Resumo anual */}
      <div className="annual-strip">
        <div className="annual-item">
          <span>Saldo projetado em Dezembro</span>
          <strong style={{ color: lastBalance >= 0 ? 'var(--pos)' : 'var(--neg)' }}>{formatCurrency(lastBalance)}</strong>
        </div>
        <div className="annual-divider" />
        <div className="annual-item">
          <span>Meses no negativo</span>
          <strong style={{ color: negativeMonths > 0 ? 'var(--warn)' : 'var(--pos)' }}>{negativeMonths}</strong>
        </div>
      </div>

      <section className="kpi-grid">
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

      <section className="timeline-card">
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

      {!hasData && (
        <div className="empty-state" style={{ margin: '40px 0' }}>
          <div className="empty-state-title">Seu painel está vazio</div>
          <div className="empty-state-desc">
            Adicione despesas e receitas em <strong>Lançamentos</strong>, ou converse com o <strong>Assistente IA</strong> para começar.
          </div>
        </div>
      )}

      {hasData && (
        <section className="month-panel">
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
                          </tr>
                        </thead>
                        <tbody>
                          {cardItems.map((item, idx) => (
                            <tr key={idx}>
                              <td>{item.desc}</td>
                              <td style={{ textAlign: 'center' }}><span className="inst-badge">{item.instStr}</span></td>
                              <td className="amt-col">{formatCurrency(item.amount)}</td>
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
