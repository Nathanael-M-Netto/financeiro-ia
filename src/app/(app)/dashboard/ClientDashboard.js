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

export default function ClientDashboard({ initialExpenses, initialIncome, initialGoals = [], initialBudgets = [], initialCards = [] }) {
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
    () => computeAll(initialExpenses, initialIncome, today, initialCards),
    [initialExpenses, initialIncome, today, initialCards]
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

  // ── Metas de economia ──────────────────────────────────────
  const [goals, setGoals] = useState(initialGoals)
  const [goalModal, setGoalModal] = useState(false)
  const [goalForm, setGoalForm] = useState({ name: '', target_amount: '', target_month: '' })
  const [goalBusy, setGoalBusy] = useState(false)
  const [goalError, setGoalError] = useState(null)

  const saveGoal = async () => {
    const amount = Number(goalForm.target_amount)
    const tMonth = parseInt(goalForm.target_month, 10)
    if (!goalForm.name.trim()) { setGoalError('Dê um nome pra meta.'); return }
    if (!isFinite(amount) || amount <= 0) { setGoalError('Valor da meta inválido.'); return }
    if (isNaN(tMonth)) { setGoalError('Escolha o mês alvo.'); return }
    setGoalBusy(true)
    setGoalError(null)
    const { data: { session } } = await supabase.auth.getSession()
    const { data, error } = await supabase.from('goals')
      .insert({ user_id: session?.user?.id, name: goalForm.name.trim(), target_amount: amount, target_month: tMonth })
      .select().single()
    setGoalBusy(false)
    if (error) { setGoalError(error.message); return }
    setGoals(g => [...g, data].sort((a, b) => a.target_month - b.target_month))
    setGoalForm({ name: '', target_amount: '', target_month: '' })
    setGoalModal(false)
  }

  const deleteGoal = async (id) => {
    setGoals(g => g.filter(x => x.id !== id))
    await supabase.from('goals').delete().eq('id', id)
  }

  // ── Orçamentos por categoria ───────────────────────────────
  const [budgets, setBudgets] = useState(initialBudgets)
  const [budgetModal, setBudgetModal] = useState(false)
  const [budgetDraft, setBudgetDraft] = useState({}) // { categoria: "600" }
  const [budgetBusy, setBudgetBusy] = useState(false)
  const [budgetError, setBudgetError] = useState(null)

  const openBudgets = () => {
    const d = {}
    budgets.forEach(b => { d[b.category] = String(b.monthly_limit) })
    setBudgetDraft(d)
    setBudgetError(null)
    setBudgetModal(true)
  }

  const saveBudgets = async () => {
    setBudgetBusy(true)
    setBudgetError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const uid = session?.user?.id
      for (const cat of Object.keys(CATEGORY_META)) {
        const raw = (budgetDraft[cat] ?? '').toString().trim()
        const existing = budgets.find(b => b.category === cat)
        const val = Number(raw)
        if (raw !== '' && (!isFinite(val) || val < 0)) throw new Error(`Valor inválido em ${CATEGORY_META[cat].name}.`)
        if (raw === '' || val === 0) {
          if (existing) await supabase.from('budgets').delete().eq('id', existing.id)
        } else if (existing) {
          if (parseFloat(existing.monthly_limit) !== val) {
            await supabase.from('budgets').update({ monthly_limit: val }).eq('id', existing.id)
          }
        } else {
          await supabase.from('budgets').insert({ user_id: uid, category: cat, monthly_limit: val })
        }
      }
      const { data: fresh } = await supabase.from('budgets').select('*').eq('user_id', uid)
      setBudgets(fresh || [])
      setBudgetModal(false)
    } catch (e) {
      setBudgetError(/relation .*budgets|does not exist/i.test(e.message || '')
        ? 'Rode a migration 0007 no Supabase para ativar os orçamentos.'
        : e.message)
    } finally {
      setBudgetBusy(false)
    }
  }

  // Gasto do mês selecionado por categoria (para as barras de orçamento).
  const spentByCat = useMemo(() => {
    const map = {}
    currentMetric.expensesList.forEach(e => {
      const key = e.category || 'outros'
      map[key] = (map[key] || 0) + e.amount
    })
    return map
  }, [currentMetric])

  // ── Termômetro financeiro (0–100, transparente) ────────────
  const health = useMemo(() => {
    if (!hasData) return null
    const cur = metrics[realMonth] || currentMetric
    const notes = []
    let score = 100
    if (cur.totalIn > 0) {
      const ratio = cur.totalOut / cur.totalIn
      if (ratio > 0.9) { score -= 40; notes.push(`Saídas consomem ${Math.round(ratio * 100)}% das entradas (-40)`) }
      else if (ratio > 0.75) { score -= 25; notes.push(`Saídas consomem ${Math.round(ratio * 100)}% das entradas (-25)`) }
      else if (ratio > 0.5) { score -= 10; notes.push(`Saídas consomem ${Math.round(ratio * 100)}% das entradas (-10)`) }
      else { notes.push(`Saídas consomem só ${Math.round(ratio * 100)}% das entradas`) }
    }
    const negs = windowMetrics.filter(m => m.balance < 0).length
    if (negs > 0) { const pen = Math.min(45, negs * 15); score -= pen; notes.push(`${negs} mês(es) no negativo à frente (-${pen})`) }
    if (cur.overdueAmount > 0) { score -= 15; notes.push(`Contas vencidas sem pagar: ${formatCurrency(cur.overdueAmount)} (-15)`) }
    score = Math.max(0, Math.min(100, Math.round(score)))
    const tone = score >= 80 ? 'pos' : score >= 55 ? 'warn' : 'neg'
    const label = score >= 80 ? 'Saudável' : score >= 55 ? 'Atenção' : 'Crítico'
    return { score, tone, label, notes }
  }, [hasData, metrics, realMonth, currentMetric, windowMetrics])

  // Marca/desmarca uma despesa como paga no mês visualizado (paid_through).
  const togglePaid = async (item) => {
    if (paidBusy || !item.id) return
    setPaidBusy(true)
    const newVal = item.isPaid ? (currentMonth > 0 ? currentMonth - 1 : null) : currentMonth
    // Filtro extra por user_id (além da RLS) — defesa em profundidade.
    const { data: { session } } = await supabase.auth.getSession()
    let q = supabase.from('expenses').update({ paid_through: newVal }).eq('id', item.id)
    if (session?.user?.id) q = q.eq('user_id', session.user.id)
    await q
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

  // Insights automáticos do mês selecionado (comparações mês a mês).
  const insights = useMemo(() => {
    const out = []
    const cur = metrics[currentMonth]
    const prev = currentMonth > 0 ? metrics[currentMonth - 1] : null
    // Saídas vs mês anterior
    if (prev && prev.totalOut > 0 && cur.totalOut > 0) {
      const pct = Math.round(((cur.totalOut - prev.totalOut) / prev.totalOut) * 100)
      if (Math.abs(pct) >= 5) {
        out.push({ tone: pct > 0 ? 'warn' : 'pos', text: `Saídas ${Math.abs(pct)}% ${pct > 0 ? 'acima' : 'abaixo'} de ${prev.monthName} (${formatCurrency(cur.totalOut)} vs ${formatCurrency(prev.totalOut)}).` })
      }
    }
    // Maior categoria do mês
    if (byCategory.arr.length > 0 && byCategory.total > 0) {
      const top = byCategory.arr[0]
      const meta = CATEGORY_META[top.key] || CATEGORY_META.outros
      out.push({ tone: 'info', text: `Maior gasto: ${meta.name} — ${formatCurrency(top.total)} (${Math.round((top.total / byCategory.total) * 100)}% do mês).` })
    }
    // Mês negativo à frente (ou o mais apertado, se nenhum negativo)
    const firstNeg = windowMetrics.find(m => m.balance < 0)
    if (firstNeg) {
      out.push({ tone: 'neg', text: `Atenção: ${firstNeg.monthName} fecha no negativo (${formatCurrency(firstNeg.balance)}).` })
    } else if (windowMetrics.length > 1) {
      const tight = windowMetrics.reduce((a, b) => (b.balance < a.balance ? b : a), windowMetrics[0])
      out.push({ tone: 'info', text: `Mês mais apertado à frente: ${tight.monthName} (saldo ${formatCurrency(tight.balance)}).` })
    }
    return out
  }, [metrics, currentMonth, windowMetrics, byCategory])

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

      {hasData && (health || insights.length > 0) && (
        <section className="dash-duo dash-detail">
          {health && (
            <div className="card health-card">
              <div className="card-body">
                <div className="timeline-title">Termômetro financeiro</div>
                <div className="health-main">
                  <div className={`health-score health-${health.tone}`}>
                    <span className="health-num">{health.score}</span>
                    <span className="health-max">/100</span>
                  </div>
                  <div className={`health-label health-${health.tone}`}>{health.label}</div>
                </div>
                <div className="health-bar"><div className={`health-fill health-${health.tone}`} style={{ width: `${health.score}%` }} /></div>
                <div className="health-notes">
                  {health.notes.map((n, i) => <div key={i} className="health-note">• {n}</div>)}
                </div>
              </div>
            </div>
          )}
          {insights.length > 0 && (
            <div className="card insights-card">
              <div className="card-body">
                <div className="timeline-title">Insights — {currentMetric.monthName}</div>
                <div className="insights-list">
                  {insights.map((ins, i) => (
                    <div key={i} className={`insight-row insight-${ins.tone}`}>
                      <span className="insight-dot" />
                      <span>{ins.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Orçamentos por categoria */}
      {hasData && (
        <section className="card budgets-card dash-detail">
          <div className="card-header">
            <span className="timeline-title" style={{ marginBottom: 0 }}>Orçamentos — {currentMetric.monthName}</span>
            <button className="btn-ghost" onClick={openBudgets}>Definir tetos</button>
          </div>
          <div className="card-body">
            {budgets.length === 0 ? (
              <div className="goals-empty">Defina um teto de gasto por categoria (ex.: Alimentação até R$ 600/mês) e acompanhe aqui.</div>
            ) : (
              <div className="budget-list">
                {budgets
                  .slice()
                  .sort((a, b) => (spentByCat[b.category] || 0) / b.monthly_limit - (spentByCat[a.category] || 0) / a.monthly_limit)
                  .map(b => {
                    const meta = CATEGORY_META[b.category] || CATEGORY_META.outros
                    const limit = parseFloat(b.monthly_limit) || 0
                    const spent = spentByCat[b.category] || 0
                    const pct = limit > 0 ? (spent / limit) * 100 : 0
                    const tone = pct >= 100 ? 'neg' : pct >= 70 ? 'warn' : 'pos'
                    return (
                      <div key={b.id} className="budget-row">
                        <div className="budget-head">
                          <span className="budget-name"><span className="budget-dot" style={{ background: meta.color }} />{meta.name}</span>
                          <span className="budget-nums">{formatCurrency(spent)} / {formatCurrency(limit)}</span>
                        </div>
                        <div className="budget-bar"><div className={`budget-fill bf-${tone}`} style={{ width: `${Math.min(100, pct)}%` }} /></div>
                        <div className={`budget-sub bs-${tone}`}>
                          {pct >= 100 ? `Estourou ${formatCurrency(spent - limit)} (${Math.round(pct)}%)` : `${Math.round(pct)}% usado · sobra ${formatCurrency(limit - spent)}`}
                        </div>
                      </div>
                    )
                  })}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Metas de economia */}
      {hasData && (
        <section className="card goals-card dash-detail">
          <div className="card-header">
            <span className="timeline-title" style={{ marginBottom: 0 }}>Metas de economia</span>
            <button className="btn-ghost" onClick={() => { setGoalError(null); setGoalModal(true) }}>+ Nova meta</button>
          </div>
          <div className="card-body">
            {goals.length === 0 ? (
              <div className="goals-empty">Nenhuma meta ainda. Ex.: “Juntar R$ 5.000 até Dezembro”.</div>
            ) : (
              <div className="goals-list">
                {goals.map(g => {
                  const target = parseFloat(g.target_amount) || 0
                  const projected = metrics[g.target_month]?.balance ?? 0
                  const pct = target > 0 ? Math.max(0, Math.min(100, (projected / target) * 100)) : 0
                  const hit = projected >= target
                  const late = g.target_month < realMonth
                  return (
                    <div key={g.id} className="goal-row">
                      <div className="goal-head">
                        <div className="goal-name">
                          {g.name}
                          <span className="goal-when">até {metrics[g.target_month]?.monthName || '—'}</span>
                          {late && <span className="goal-late">mês já passou</span>}
                        </div>
                        <div className="goal-nums">
                          <strong style={{ color: hit ? 'var(--pos)' : 'var(--text)' }}>{formatCurrency(projected)}</strong>
                          <span> / {formatCurrency(target)}</span>
                          <button className="goal-del" onClick={() => deleteGoal(g.id)} title="Excluir meta">✕</button>
                        </div>
                      </div>
                      <div className="goal-bar">
                        <div className={`goal-fill ${hit ? 'hit' : ''}`} style={{ width: `${pct}%` }} />
                      </div>
                      <div className="goal-sub">
                        {hit
                          ? `Meta batida na projeção — sobra ${formatCurrency(projected - target)} 🎉`
                          : `Faltam ${formatCurrency(target - projected)} na projeção de ${metrics[g.target_month]?.monthName || '—'} (${Math.round(pct)}%)`}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </section>
      )}

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

      {/* Modal: orçamentos por categoria */}
      <div className={`modal-backdrop ${budgetModal ? 'open' : ''}`}>
        <div className="modal-box" style={{ maxWidth: '440px' }}>
          <div className="modal-hd">
            <div style={{ fontWeight: 800, fontSize: '.9rem', color: '#fff' }}>Tetos de gasto por categoria</div>
            <button className="modal-close" onClick={() => setBudgetModal(false)}>✕</button>
          </div>
          <div className="modal-bd">
            <p style={{ fontSize: '.78rem', color: 'var(--text2)', lineHeight: 1.5, marginBottom: '12px' }}>
              Quanto você quer gastar <strong style={{ color: 'var(--text)' }}>no máximo por mês</strong> em cada categoria. Deixe em branco para não acompanhar.
            </p>
            <div className="budget-edit-grid">
              {Object.keys(CATEGORY_META).map(cat => (
                <div key={cat} className="budget-edit-row">
                  <span className="budget-name"><span className="budget-dot" style={{ background: CATEGORY_META[cat].color }} />{CATEGORY_META[cat].name}</span>
                  <input className="form-input budget-edit-input" type="number" min="0" step="10" placeholder="—"
                    value={budgetDraft[cat] ?? ''}
                    onChange={e => setBudgetDraft(d => ({ ...d, [cat]: e.target.value }))} />
                </div>
              ))}
            </div>
            {budgetError && <div className="form-hint hint-warn" style={{ marginTop: '10px' }}>{budgetError}</div>}
          </div>
          <div className="modal-ft">
            <button className="nav-btn" onClick={() => setBudgetModal(false)}>Cancelar</button>
            <button className="btn-ai" onClick={saveBudgets} disabled={budgetBusy}>{budgetBusy ? 'Salvando...' : 'Salvar tetos'}</button>
          </div>
        </div>
      </div>

      {/* Modal: nova meta */}
      <div className={`modal-backdrop ${goalModal ? 'open' : ''}`}>
        <div className="modal-box" style={{ maxWidth: '420px' }}>
          <div className="modal-hd">
            <div style={{ fontWeight: 800, fontSize: '.9rem', color: '#fff' }}>Nova meta de economia</div>
            <button className="modal-close" onClick={() => setGoalModal(false)}>✕</button>
          </div>
          <div className="modal-bd">
            <div className="form-group">
              <label className="form-label">Nome da meta</label>
              <input className="form-input" maxLength={60} value={goalForm.name}
                onChange={e => setGoalForm({ ...goalForm, name: e.target.value })}
                placeholder="Ex: Reserva de emergência, Viagem..." />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Quero ter (R$)</label>
                <input className="form-input" type="number" min="0" step="0.01" value={goalForm.target_amount}
                  onChange={e => setGoalForm({ ...goalForm, target_amount: e.target.value })} placeholder="5000" />
              </div>
              <div className="form-group">
                <label className="form-label">Até quando</label>
                <select className="form-input" value={goalForm.target_month}
                  onChange={e => setGoalForm({ ...goalForm, target_month: e.target.value })}>
                  <option value="">Escolha o mês</option>
                  {windowMetrics.map(m => <option key={m.idx} value={m.idx}>{m.monthName}</option>)}
                </select>
              </div>
            </div>
            <p style={{ fontSize: '.75rem', color: 'var(--text2)', lineHeight: 1.5 }}>
              A meta é comparada com o <strong style={{ color: 'var(--text)' }}>saldo projetado</strong> do mês escolhido.
            </p>
            {goalError && <div className="form-hint hint-warn">{goalError}</div>}
          </div>
          <div className="modal-ft">
            <button className="nav-btn" onClick={() => setGoalModal(false)}>Cancelar</button>
            <button className="btn-ai" onClick={saveGoal} disabled={goalBusy}>{goalBusy ? 'Salvando...' : 'Criar meta'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
