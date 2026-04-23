'use client'

import React, { useState, useMemo, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { computeAll, formatCurrency } from '@/lib/finance-engine'
import { MONTHS_NAMES, CARD_META } from '@/lib/constants'
import { createClient } from '@/lib/supabase-browser'

export default function ClientDashboard({ initialExpenses, initialIncome, userEmail, userName }) {
  const router = useRouter()
  const supabase = createClient()

  // State
  const [currentMonth, setCurrentMonth] = useState(0)
  const [isSidebarOpen, setSidebarOpen] = useState(false)
  const [showAIModal, setShowAIModal] = useState(false)
  
  // AI State
  const [aiInput, setAiInput] = useState('')
  const [aiFeedback, setAiFeedback] = useState({ show: false, msg: '', type: '' })
  const [isProcessing, setIsProcessing] = useState(false)

  // Toast
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' })

  // Engine (Computed directly from server props)
  const metrics = useMemo(() => computeAll(initialExpenses, initialIncome), [initialExpenses, initialIncome])
  const currentMetric = metrics[currentMonth]
  const lastBalance = metrics[metrics.length - 1].balance
  const negativeMonths = metrics.filter(m => m.balance < 0).length

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type })
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 4000)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const [aiResponse, setAiResponse] = useState('')

  const handleAIProcess = async () => {
    if (aiInput.trim().length < 3) {
      setAiFeedback({ show: true, msg: 'Descreva o comando com mais detalhes.', type: 'error' })
      return
    }

    setIsProcessing(true)
    setAiFeedback({ show: true, msg: 'Processando IA...', type: 'loading' })

    try {
      const response = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userText: aiInput })
      })

      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Erro na API')

      router.refresh() // Recarrega os dados do Server Component
      
      setAiResponse(result.message)
      setAiFeedback({ show: false, msg: '', type: '' })
      showToast(`Ação concluída via ${result.modelUsed}!`, 'success')
      setAiInput('')

    } catch (err) {
      setAiFeedback({ show: true, msg: `Erro: ${err.message}`, type: 'error' })
    } finally {
      setIsProcessing(false)
    }
  }

  const displayName = userName ? userName.split(' ')[0] : 'Admin'

  return (
    <>
      <aside className={`sidebar ${isSidebarOpen ? 'open' : ''}`} id="sidebar">
        <div className="sidebar-logo gap-3 flex items-center">
          <div className="sidebar-logo-icon">
            <svg width="18" height="18" fill="none" stroke="#fff" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm-1-6h2v4h-2V10z" /></svg>
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '.9rem', color: '#fff', letterSpacing: '0.02em', lineHeight: 1.1 }}>FinDash</div>
            <div style={{ fontSize: '.6rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text3)' }}>Olá, {displayName}</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {metrics.map((m, i) => (
            <button
              key={i}
              onClick={() => { setCurrentMonth(i); setSidebarOpen(false); }}
              className={`month-btn ${currentMonth === i ? 'active' : ''}`}
            >
              <span>{m.monthName}</span>
              <span className={`month-badge ${m.balance >= 0 ? 'badge-pos' : 'badge-neg'}`}>
                {formatCurrency(m.balance)}
              </span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div style={{ fontSize: '.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text3)', marginBottom: '4px' }}>RESUMO ANUAL</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span>Saldo Dez/26</span>
            <strong style={{ color: lastBalance >= 0 ? 'var(--pos)' : 'var(--neg)' }}>{formatCurrency(lastBalance)}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Meses negativos</span>
            <strong style={{ color: negativeMonths > 0 ? 'var(--warn)' : 'var(--pos)' }}>{negativeMonths}</strong>
          </div>
          <button onClick={handleLogout} style={{ marginTop: '16px', background: 'none', border:'none', color: 'var(--neg)', cursor: 'pointer', fontSize:'0.7rem' }}>Sair da conta</button>
        </div>
      </aside>

      {/* Overlay Mobile */}
      <div id="overlay" className={isSidebarOpen ? 'open' : ''} onClick={() => setSidebarOpen(false)} style={{ display: isSidebarOpen ? 'block' : 'none', position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 99 }}></div>

      <main className="main-wrap anim">
        <header className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button className="nav-btn hamburger-btn" onClick={() => setSidebarOpen(true)}>Menu</button>
            <h1 style={{ fontSize: '2rem', fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1 }}>{currentMetric.monthName} 2026</h1>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn-ai" onClick={() => setShowAIModal(true)} style={{ background: 'linear-gradient(135deg, #10d49c, #1084a4)', boxShadow: '0 4px 18px rgba(16,212,156,.3)'}}>
              <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              ✨ IA FinDash
            </button>
            <button className="nav-btn" disabled={currentMonth === 0} onClick={() => setCurrentMonth(prev => Math.max(0, prev - 1))}>Anterior</button>
            <button className="nav-btn" disabled={currentMonth === 8} onClick={() => setCurrentMonth(prev => Math.min(8, prev + 1))}>Próximo</button>
          </div>
        </header>

        <section className="kpi-grid">
          <div className="kpi-card" style={{'--kpi-accent': 'var(--pos)'}}>
            <div className="kpi-label">Total de Entradas</div>
            <div className="kpi-value" style={{color: 'var(--pos)'}}>{formatCurrency(currentMetric.totalIn)}</div>
          </div>
          <div className="kpi-card" style={{'--kpi-accent': 'var(--neg)'}}>
            <div className="kpi-label">Total de Saídas</div>
            <div className="kpi-value" style={{color: 'var(--neg)'}}>{formatCurrency(currentMetric.totalOut)}</div>
          </div>
          <div className="kpi-card" style={{'--kpi-accent': currentMetric.balance >= 0 ? 'var(--pos)' : 'var(--neg)'}}>
            <div className="kpi-label">Saldo Líquido</div>
            <div className="kpi-value" style={{color: currentMetric.balance >= 0 ? 'var(--pos)' : 'var(--neg)'}}>
              {currentMetric.balance > 0 ? '+' : ''}{formatCurrency(currentMetric.balance)}
            </div>
            <div className="kpi-sub">Transporta p/ próximo mês</div>
          </div>
          <div className="kpi-card" style={{'--kpi-accent': 'var(--info)'}}>
            <div className="kpi-label">Itens de Despesa</div>
            <div className="kpi-value" style={{color: 'var(--info)'}}>{currentMetric.activeCardsCount}</div>
            <div className="kpi-sub">cartão(es) ou itens ativos</div>
          </div>
        </section>

        <section className="timeline-card">
          <div className="timeline-title">Linha do Tempo — {currentMetric.monthName}</div>
          <div className="timeline-scroll">
            <div className="timeline-events">
              {currentMetric.timelineEvents.map((ev, i) => (
                <div key={i} className={`tl-ev ${ev.type}`}>
                  <div className="tl-day">DIA {ev.day}</div>
                  <div className="tl-label">{ev.label}</div>
                  <div className={`tl-amount ${ev.type}`}>{formatCurrency(ev.amount)}</div>
                  {ev.lateLabel && <span className="tl-late-tag">ATRASO</span>}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ALERTAS DINÂMICOS */}
        {currentMetric.alerts && currentMetric.alerts.map((alert, i) => (
          <div key={i} className={`alert alert-${alert.type}`} style={{marginBottom: '10px'}}>
            {alert.text}
          </div>
        ))}

        {initialExpenses.length === 0 && initialIncome.length === 0 && (
          <div className="empty-state" style={{margin: '40px 0'}}>
            <div className="empty-state-title">Seu painel está limpo</div>
            <div className="empty-state-desc">
              Use a **Inteligência FinDash** (botão ✨ IA FinDash) acima para conversar com o assistente, pedir previsões financeiras ou inserir lançamentos facilmente por texto.
            </div>
          </div>
        )}

        {(initialExpenses.length > 0 || initialIncome.length > 0) && (
        <section className="month-panel" style={{ marginTop: '22px' }}>
          <div>
            <div className="card card-group">
              <div className="card-header">
                <span className="timeline-title" style={{marginBottom: 0}}>Despesas Detalhadas — {currentMetric.monthName}</span>
                <span className="hero-negative" style={{fontSize: '.9rem', fontWeight: 800}}>{formatCurrency(currentMetric.totalOut)}</span>
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
                            <th className="align-center" style={{textAlign: 'center'}}>Parcela</th>
                            <th className="align-right">Valor</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cardItems.map((item, idx) => (
                            <tr key={idx}>
                              <td>{item.desc}</td>
                              <td style={{textAlign: 'center'}}><span className="inst-badge">{item.instStr}</span></td>
                              <td className="amt-col">{formatCurrency(item.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                })}
                {currentMetric.expensesList.length === 0 && (
                  <div style={{textAlign: 'center', color: 'var(--text2)', fontSize: '.8rem', padding: '16px 0'}}>Nenhuma despesa neste mês.</div>
                )}
              </div>
            </div>
          </div>

          <div className="summary-col">
            <div className={`balance-hero ${currentMetric.balance >= 0 ? 'positive' : 'negative'}`}>
              <div className="hero-label">Saldo Efetivo — Final do Mês</div>
              <div className={`hero-value ${currentMetric.balance >= 0 ? 'hero-positive' : 'hero-negative'}`}>{formatCurrency(currentMetric.balance)}</div>
            </div>

            <div className="totals-table">
              <table>
                <tbody>
                  <tr className="totals-row-in">
                    <td>Entradas do Mês</td>
                    <td className="hero-positive">{formatCurrency(currentMetric.totalIn)}</td>
                  </tr>
                  {currentMetric.incomeList.map((inc, i) => (
                    <tr key={`inc-${i}`}>
                      <td style={{paddingLeft: '24px', fontSize: '.75rem'}}>• {inc.label}</td>
                      <td className="hero-positive">{formatCurrency(inc.amount)}</td>
                    </tr>
                  ))}
                  <tr className="totals-row-out">
                    <td>Saídas do Mês</td>
                    <td className="hero-negative">{formatCurrency(currentMetric.totalOut)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>
        )}
      </main>

      {/* Modal IA */}
      <div className={`modal-backdrop ${showAIModal ? 'open' : ''}`}>
        <div className="modal-box">
          <div className="modal-hd">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div className="modal-icon" style={{ background: 'linear-gradient(135deg, #10d49c, #1084a4)'}}>
                <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: '.9rem', color: '#fff' }}>Assistente FinDash IA</div>
                <div style={{ fontSize: '.65rem', color: 'var(--text2)' }}>IA Segura & Processamento Edge</div>
              </div>
            </div>
            <button className="modal-close" onClick={() => setShowAIModal(false)}>✕</button>
          </div>
          <div className="modal-bd">
            {!aiResponse ? (
              <div className="form-group">
                <label className="form-label">O que você deseja fazer?</label>
                <textarea 
                  className="ai-textarea" 
                  value={aiInput} 
                  onChange={e => setAiInput(e.target.value)} 
                  placeholder="Exemplos:&#10;- Adicione a fatura da Havan, 50 reais em Abril&#10;- Apague a despesa do Mercado Pago&#10;- Qual o total das minhas dívidas do Nubank se eu atrasar 5 dias?&#10;- Adicione Salário 2300 a partir de Maio por 10 meses"
                />
              </div>
            ) : (
              <div className="ai-response" style={{ padding: '16px', background: 'var(--surface2)', borderRadius: '12px', border: '1px solid var(--border2)', color: 'var(--text)', fontSize: '.85rem', lineHeight: '1.6', whiteSpace: 'pre-wrap', maxHeight: '400px', overflowY: 'auto' }}>
                {aiResponse}
              </div>
            )}
            {aiFeedback.show && <div className={`ai-feedback ${aiFeedback.type}`}>{aiFeedback.msg}</div>}
          </div>
          <div className="modal-ft">
            {!aiResponse ? (
              <>
                <button className="nav-btn" onClick={() => setShowAIModal(false)}>Cancelar</button>
                <button className="btn-ai" onClick={handleAIProcess} disabled={isProcessing}>
                  {isProcessing ? 'Processando...' : 'Enviar Comando'}
                </button>
              </>
            ) : (
              <button className="btn-ai" onClick={() => { setAiResponse(''); setAiInput(''); }}>Nova Ação</button>
            )}
          </div>
        </div>
      </div>

      <div className={`toast ${toast.type} ${toast.show ? 'show' : ''}`}>
        {toast.message}
      </div>
    </>
  )
}
