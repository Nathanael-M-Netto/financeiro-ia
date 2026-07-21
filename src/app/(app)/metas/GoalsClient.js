'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { formatCurrency } from '@/lib/finance-engine'
import {
  analyzeGoal, buildGoalProjection, currentGoalBalance, monthIndexForTarget,
  parseLocalDate, targetDateForGoal,
} from '@/lib/goals'
import {
  IconArrowDown, IconArrowUp, IconCheckCircle, IconClose, IconPencil,
  IconPlus, IconTarget, IconTrash, IconTrendingUp, IconWallet,
} from '@/lib/icons'

const EMPTY_GOAL = {
  name: '', target_amount: '', target_date: '', initial_amount: '',
  monthly_contribution: '', monthly_interest_rate: '', contribution_day: '1',
}

const EMPTY_TX = { type: 'contribution', amount: '', occurred_on: '', note: '' }

const brDate = (date) => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(date)
const brMonth = (date) => `${new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(date).replace('.', '')}/${String(date.getFullYear()).slice(-2)}`

export default function GoalsClient({ initialGoals, initialTransactions, migrationReady, todayISO }) {
  const supabase = createClient()
  const today = useMemo(() => parseLocalDate(todayISO) || new Date(), [todayISO])
  const [goals, setGoals] = useState(initialGoals)
  const [transactions, setTransactions] = useState(initialTransactions)
  const [selectedId, setSelectedId] = useState(initialGoals[0]?.id || null)
  const [goalModal, setGoalModal] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [goalForm, setGoalForm] = useState(EMPTY_GOAL)
  const [txModal, setTxModal] = useState(false)
  const [txForm, setTxForm] = useState({ ...EMPTY_TX, occurred_on: todayISO })
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const goalNameRef = useRef(null)

  useEffect(() => {
    if (!goalModal) return
    const timer = setTimeout(() => goalNameRef.current?.focus(), 0)
    return () => clearTimeout(timer)
  }, [goalModal])

  useEffect(() => {
    if (!goalModal && !txModal && !confirmDelete) return
    const closeOnEscape = (event) => {
      if (event.key !== 'Escape') return
      if (confirmDelete) setConfirmDelete(null)
      else if (txModal) setTxModal(false)
      else setGoalModal(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [goalModal, txModal, confirmDelete])

  const txByGoal = useMemo(() => {
    const map = new Map()
    transactions.forEach(tx => map.set(tx.goal_id, [...(map.get(tx.goal_id) || []), tx]))
    return map
  }, [transactions])

  const analyses = useMemo(() => new Map(goals.map(goal => [
    goal.id,
    analyzeGoal(goal, txByGoal.get(goal.id) || [], today),
  ])), [goals, txByGoal, today])

  const selected = goals.find(goal => goal.id === selectedId) || goals[0] || null
  const selectedTx = selected ? (txByGoal.get(selected.id) || []) : []
  const selectedAnalysis = selected ? analyses.get(selected.id) : null
  const projection = selected ? buildGoalProjection(selected, selectedTx, today) : []
  const reservedTotal = goals.reduce((sum, goal) => sum + currentGoalBalance(goal, txByGoal.get(goal.id) || []), 0)
  const targetTotal = goals.reduce((sum, goal) => sum + (Number(goal.target_amount) || 0), 0)
  const monthlyPlan = goals.reduce((sum, goal) => sum + (Number(goal.monthly_contribution) || 0), 0)

  const ensureMigration = () => {
    if (migrationReady) return true
    setError('Rode a migration 0008 no Supabase para ativar caixinhas, aportes e rendimentos.')
    return false
  }

  const openNew = () => {
    setEditingId(null)
    setGoalForm({ ...EMPTY_GOAL, target_date: `${today.getFullYear() + 1}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}` })
    setError(null)
    setGoalModal(true)
  }

  const openEdit = (goal) => {
    setEditingId(goal.id)
    setGoalForm({
      name: goal.name || '',
      target_amount: String(goal.target_amount ?? ''),
      target_date: goal.target_date || targetDateForGoal(goal).toISOString().slice(0, 10),
      initial_amount: String(goal.initial_amount ?? 0),
      monthly_contribution: String(goal.monthly_contribution ?? 0),
      monthly_interest_rate: String(goal.monthly_interest_rate ?? 0),
      contribution_day: String(goal.contribution_day ?? 1),
    })
    setError(null)
    setGoalModal(true)
  }

  const saveGoal = async () => {
    if (!ensureMigration()) return
    const target = Number(goalForm.target_amount)
    const initial = Number(goalForm.initial_amount || 0)
    const monthly = Number(goalForm.monthly_contribution || 0)
    const rate = Number(goalForm.monthly_interest_rate || 0)
    const day = Number(goalForm.contribution_day)
    const targetDate = parseLocalDate(goalForm.target_date)
    if (!goalForm.name.trim()) { setError('Dê um nome para a caixinha.'); return }
    if (!Number.isFinite(target) || target <= 0) { setError('Informe um objetivo maior que zero.'); return }
    if (!targetDate) { setError('Informe uma data válida para a meta.'); return }
    if (![initial, monthly, rate].every(v => Number.isFinite(v) && v >= 0)) { setError('Valores e taxa não podem ser negativos.'); return }
    if (rate > 100) { setError('Confira a taxa: use o percentual mensal, por exemplo 0,8.'); return }
    if (!Number.isInteger(day) || day < 1 || day > 31) { setError('O dia do aporte deve ficar entre 1 e 31.'); return }
    setBusy(true)
    setError(null)
    const { data: { session } } = await supabase.auth.getSession()
    const payload = {
      user_id: session?.user?.id,
      name: goalForm.name.trim(),
      target_amount: target,
      target_date: goalForm.target_date,
      target_month: monthIndexForTarget(targetDate),
      initial_amount: initial,
      monthly_contribution: monthly,
      monthly_interest_rate: rate,
      contribution_day: day,
      status: 'active',
    }
    const query = editingId
      ? supabase.from('goals').update(payload).eq('id', editingId).eq('user_id', session?.user?.id)
      : supabase.from('goals').insert(payload)
    const { data, error: saveError } = await query.select().single()
    setBusy(false)
    if (saveError) { setError(saveError.message); return }
    setGoals(prev => editingId ? prev.map(goal => goal.id === editingId ? data : goal) : [...prev, data])
    setSelectedId(data.id)
    setGoalModal(false)
  }

  const openTransaction = (type = 'contribution') => {
    if (!selected || !ensureMigration()) return
    setTxForm({ ...EMPTY_TX, type, occurred_on: todayISO })
    setError(null)
    setTxModal(true)
  }

  const saveTransaction = async () => {
    if (!selected || !ensureMigration()) return
    const amount = Number(txForm.amount)
    const date = parseLocalDate(txForm.occurred_on)
    if (!Number.isFinite(amount) || amount <= 0) { setError('Informe um valor maior que zero.'); return }
    if (!date) { setError('Informe uma data válida.'); return }
    if (date > today) { setError('Movimentações realizadas não podem ficar no futuro. Use o aporte mensal para planejar.'); return }
    if (txForm.type === 'withdrawal' && amount > selectedAnalysis.current) {
      setError(`A retirada não pode passar do saldo da caixinha (${formatCurrency(selectedAnalysis.current)}).`)
      return
    }
    setBusy(true)
    setError(null)
    const { data: { session } } = await supabase.auth.getSession()
    const { data, error: saveError } = await supabase.from('goal_transactions').insert({
      user_id: session?.user?.id,
      goal_id: selected.id,
      type: txForm.type,
      amount,
      occurred_on: txForm.occurred_on,
      note: txForm.note.trim() || null,
    }).select().single()
    setBusy(false)
    if (saveError) { setError(saveError.message); return }
    setTransactions(prev => [data, ...prev])
    setTxModal(false)
  }

  const deleteGoal = async () => {
    if (!confirmDelete) return
    const id = confirmDelete.id
    setGoals(prev => prev.filter(goal => goal.id !== id))
    setTransactions(prev => prev.filter(tx => tx.goal_id !== id))
    setSelectedId(goals.find(goal => goal.id !== id)?.id || null)
    setConfirmDelete(null)
    const { data: { session } } = await supabase.auth.getSession()
    await supabase.from('goals').delete().eq('id', id).eq('user_id', session?.user?.id)
  }

  return (
    <div className="page goals-page anim">
      <header className="app-topbar goals-topbar">
        <div>
          <h1 className="page-title">Metas e rendimentos</h1>
          <p className="page-sub">Caixinhas separadas dos gastos, com aportes e juros compostos.</p>
        </div>
        <button className="btn-ai goals-new" onClick={openNew}><IconPlus size={16} /> Nova caixinha</button>
      </header>

      {!migrationReady && (
        <div className="alert alert-warn"><span>Falta ativar a estrutura nova no banco. Rode a migration 0008 antes de criar ou editar caixinhas.</span></div>
      )}
      {error && !goalModal && !txModal && <div className="ai-feedback error goals-page-error">{error}</div>}

      <section className="goals-overview" aria-label="Resumo das metas">
        <div className="goal-kpi primary"><span className="goal-kpi-icon"><IconWallet size={18} /></span><div><span>Guardado nas caixinhas</span><strong>{formatCurrency(reservedTotal)}</strong></div></div>
        <div className="goal-kpi"><span className="goal-kpi-icon"><IconTarget size={18} /></span><div><span>Objetivos somados</span><strong>{formatCurrency(targetTotal)}</strong></div></div>
        <div className="goal-kpi"><span className="goal-kpi-icon"><IconArrowDown size={18} /></span><div><span>Aportes planejados/mês</span><strong>{formatCurrency(monthlyPlan)}</strong></div></div>
      </section>

      {goals.length === 0 ? (
        <section className="goal-empty-state card">
          <div className="goal-empty-icon"><IconTarget size={28} /></div>
          <h2>Transforme uma intenção em plano</h2>
          <p>Informe quanto já guardou, aonde quer chegar e até quando. O FinDash calcula o aporte mensal e simula o rendimento.</p>
          <button className="btn-ai" onClick={openNew}><IconPlus size={16} /> Criar primeira caixinha</button>
        </section>
      ) : (
        <>
          <section className="goal-pocket-grid" aria-label="Suas caixinhas">
            {goals.map(goal => {
              const a = analyses.get(goal.id)
              return (
                <button key={goal.id} className={`goal-pocket ${selected?.id === goal.id ? 'selected' : ''}`} onClick={() => setSelectedId(goal.id)}>
                  <div className="goal-pocket-head">
                    <span className={`goal-status-dot ${a.onTrack ? 'track' : 'behind'}`} />
                    <span className="goal-pocket-name">{goal.name}</span>
                    <span className={`goal-track-label ${a.onTrack ? 'track' : 'behind'}`}>{a.reached ? 'Concluída' : a.onTrack ? 'No ritmo' : 'Ajuste necessário'}</span>
                  </div>
                  <div className="goal-pocket-value">{formatCurrency(a.current)}</div>
                  <div className="goal-pocket-target">de {formatCurrency(a.target)} · até {brDate(a.targetDate)}</div>
                  <div className="goal-pocket-bar"><span style={{ width: `${a.progress}%` }} /></div>
                  <div className="goal-pocket-foot"><span>{Math.round(a.progress)}% guardado</span><span>faltam {formatCurrency(a.missing)}</span></div>
                </button>
              )
            })}
          </section>

          {selected && selectedAnalysis && (
            <section className="goal-detail card">
              <div className="card-header goal-detail-header">
                <div>
                  <span className="goal-detail-eyebrow">Plano da caixinha</span>
                  <h2>{selected.name}</h2>
                </div>
                <div className="goal-detail-actions">
                  <button className="btn-ghost" onClick={() => openEdit(selected)}><IconPencil size={14} /> Editar</button>
                  <button className="btn-ghost danger-text" onClick={() => setConfirmDelete(selected)}><IconTrash size={14} /> Excluir</button>
                </div>
              </div>
              <div className="card-body">
                <div className="goal-detail-kpis">
                  <div><span>Saldo reservado</span><strong>{formatCurrency(selectedAnalysis.current)}</strong></div>
                  <div><span>Falta guardar</span><strong>{formatCurrency(selectedAnalysis.missing)}</strong></div>
                  <div><span>Projeção na data</span><strong className={selectedAnalysis.onTrack ? 'pos' : 'warn'}>{formatCurrency(selectedAnalysis.projected)}</strong></div>
                  <div><span>Rendimento mensal</span><strong>{selectedAnalysis.rate.toLocaleString('pt-BR')}%</strong></div>
                </div>

                <div className={`goal-advice ${selectedAnalysis.onTrack ? 'track' : 'behind'}`}>
                  <div className="goal-advice-icon">{selectedAnalysis.onTrack ? <IconCheckCircle size={20} /> : <IconTrendingUp size={20} />}</div>
                  <div>
                    <strong>{selectedAnalysis.reached ? 'Objetivo alcançado' : selectedAnalysis.onTrack ? 'Seu plano chega ao objetivo' : 'Seu aporte planejado precisa de ajuste'}</strong>
                    <p>
                      {selectedAnalysis.reached
                        ? `Você já tem ${formatCurrency(selectedAnalysis.current - selectedAnalysis.target)} além do objetivo.`
                        : selectedAnalysis.periods === 0
                          ? `A data chegou e ainda faltam ${formatCurrency(selectedAnalysis.missing)}.`
                          : selectedAnalysis.onTrack
                            ? `Guardando ${formatCurrency(selectedAnalysis.plannedMonthly)} por mês, a projeção chega a ${formatCurrency(selectedAnalysis.projected)} em ${brDate(selectedAnalysis.targetDate)}.`
                            : `Para chegar até ${brDate(selectedAnalysis.targetDate)}, guarde cerca de ${formatCurrency(selectedAnalysis.recommendedMonthly)} por mês — ${formatCurrency(selectedAnalysis.monthlyGap)} a mais que o plano atual.`}
                    </p>
                  </div>
                </div>

                <div className="goal-progress-large">
                  <div className="goal-progress-head"><span>Progresso real</span><strong>{Math.round(selectedAnalysis.progress)}%</strong></div>
                  <div className="goal-progress-track"><span className="real" style={{ width: `${selectedAnalysis.progress}%` }} /><span className="projected" style={{ left: `${selectedAnalysis.progress}%`, width: `${Math.max(0, selectedAnalysis.projectedProgress - selectedAnalysis.progress)}%` }} /></div>
                  <div className="goal-progress-legend"><span><i className="real" /> já guardado</span><span><i className="projected" /> projeção com aportes e juros</span></div>
                </div>

                <div className="goal-detail-columns">
                  <div className="goal-plan-panel">
                    <div className="goal-section-head"><div><h3>Projeção mensal</h3><p>O aporte entra antes do rendimento do mês.</p></div></div>
                    <div className="goal-projection-list">
                      {projection.slice(0, 18).map((row, index) => (
                        <div className="goal-projection-row" key={`${row.date.toISOString()}-${index}`}>
                          <span>{brMonth(row.date)}</span>
                          <span className="goal-projection-math">+ {formatCurrency(row.contribution)} aporte {row.interest > 0 && `· + ${formatCurrency(row.interest)} rendimento`}</span>
                          <strong>{formatCurrency(row.balance)}</strong>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="goal-ledger-panel">
                    <div className="goal-section-head">
                      <div><h3>Movimentações</h3><p>Não contam como gasto de consumo.</p></div>
                      <div className="goal-ledger-actions">
                        <button className="btn-ghost" onClick={() => openTransaction('contribution')}><IconArrowDown size={14} /> Aportar</button>
                        <button className="btn-ghost" onClick={() => openTransaction('withdrawal')}><IconArrowUp size={14} /> Retirar</button>
                      </div>
                    </div>
                    {selectedTx.length === 0 ? (
                      <div className="goal-ledger-empty">O valor inicial é {formatCurrency(Number(selected.initial_amount) || 0)}. Registre novos aportes, retiradas ou rendimentos aqui.</div>
                    ) : (
                      <div className="goal-ledger-list">
                        {selectedTx.map(tx => (
                          <div className="goal-ledger-row" key={tx.id}>
                            <span className={`goal-ledger-type ${tx.type}`}>
                              {tx.type === 'contribution' ? <IconArrowDown size={14} /> : tx.type === 'withdrawal' ? <IconArrowUp size={14} /> : <IconTrendingUp size={14} />}
                            </span>
                            <div><strong>{tx.type === 'contribution' ? 'Aporte' : tx.type === 'withdrawal' ? 'Retirada' : 'Rendimento'}</strong><span>{brDate(parseLocalDate(tx.occurred_on))}{tx.note ? ` · ${tx.note}` : ''}</span></div>
                            <strong className={tx.type === 'withdrawal' ? 'neg' : 'pos'}>{tx.type === 'withdrawal' ? '−' : '+'}{formatCurrency(Number(tx.amount) || 0)}</strong>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>
          )}
        </>
      )}

      <div className={`modal-backdrop ${goalModal ? 'open' : ''}`} role="presentation" onMouseDown={() => setGoalModal(false)}>
        <div className="modal-box goal-modal" role="dialog" aria-modal="true" aria-labelledby="goal-modal-title" onMouseDown={event => event.stopPropagation()}>
          <div className="modal-hd"><div id="goal-modal-title" className="modal-title">{editingId ? 'Editar caixinha' : 'Nova caixinha'}</div><button className="modal-close" onClick={() => setGoalModal(false)} aria-label="Fechar"><IconClose size={16} /></button></div>
          <div className="modal-bd goal-form-grid">
            <div className="form-group full"><label className="form-label" htmlFor="goal-name">Nome</label><input ref={goalNameRef} id="goal-name" className="form-input" value={goalForm.name} onChange={e => setGoalForm({ ...goalForm, name: e.target.value })} placeholder="Reserva de emergência" maxLength={60} /></div>
            <div className="form-group"><label className="form-label" htmlFor="goal-target">Objetivo</label><input id="goal-target" className="form-input" type="number" min="0.01" step="0.01" value={goalForm.target_amount} onChange={e => setGoalForm({ ...goalForm, target_amount: e.target.value })} placeholder="10000" /></div>
            <div className="form-group"><label className="form-label" htmlFor="goal-date">Quero chegar até</label><input id="goal-date" className="form-input" type="date" min={todayISO} value={goalForm.target_date} onChange={e => setGoalForm({ ...goalForm, target_date: e.target.value })} /></div>
            <div className="form-group"><label className="form-label" htmlFor="goal-initial">Já tenho guardado</label><input id="goal-initial" className="form-input" type="number" min="0" step="0.01" value={goalForm.initial_amount} onChange={e => setGoalForm({ ...goalForm, initial_amount: e.target.value })} placeholder="0" /></div>
            <div className="form-group"><label className="form-label" htmlFor="goal-monthly">Aporte por mês</label><input id="goal-monthly" className="form-input" type="number" min="0" step="0.01" value={goalForm.monthly_contribution} onChange={e => setGoalForm({ ...goalForm, monthly_contribution: e.target.value })} placeholder="300" /></div>
            <div className="form-group"><label className="form-label" htmlFor="goal-rate">Rendimento ao mês (%)</label><input id="goal-rate" className="form-input" type="number" min="0" max="100" step="0.01" value={goalForm.monthly_interest_rate} onChange={e => setGoalForm({ ...goalForm, monthly_interest_rate: e.target.value })} placeholder="0,8" /></div>
            <div className="form-group"><label className="form-label" htmlFor="goal-day">Dia do aporte</label><input id="goal-day" className="form-input" type="number" min="1" max="31" step="1" value={goalForm.contribution_day} onChange={e => setGoalForm({ ...goalForm, contribution_day: e.target.value })} /></div>
            <div className="goal-form-note full">O aporte mensal é um plano, não uma confirmação automática. Registre a movimentação quando o dinheiro realmente for para a caixinha.</div>
            {error && <div className="form-hint hint-warn full">{error}</div>}
          </div>
          <div className="modal-ft"><button className="nav-btn" onClick={() => setGoalModal(false)}>Cancelar</button><button className="btn-ai" onClick={saveGoal} disabled={busy}>{busy ? 'Salvando…' : editingId ? 'Salvar alterações' : 'Criar caixinha'}</button></div>
        </div>
      </div>

      <div className={`modal-backdrop ${txModal ? 'open' : ''}`} role="presentation" onMouseDown={() => setTxModal(false)}>
        <div className="modal-box goal-tx-modal" role="dialog" aria-modal="true" aria-labelledby="tx-modal-title" onMouseDown={event => event.stopPropagation()}>
          <div className="modal-hd"><div id="tx-modal-title" className="modal-title">Movimentar {selected?.name}</div><button className="modal-close" onClick={() => setTxModal(false)} aria-label="Fechar"><IconClose size={16} /></button></div>
          <div className="modal-bd goal-form-grid">
            <div className="form-group full"><label className="form-label" htmlFor="tx-type">Tipo</label><select id="tx-type" className="form-input" value={txForm.type} onChange={e => setTxForm({ ...txForm, type: e.target.value })}><option value="contribution">Aporte</option><option value="withdrawal">Retirada</option><option value="yield">Rendimento recebido</option></select></div>
            <div className="form-group"><label className="form-label" htmlFor="tx-amount">Valor</label><input id="tx-amount" className="form-input" type="number" min="0.01" step="0.01" value={txForm.amount} onChange={e => setTxForm({ ...txForm, amount: e.target.value })} autoFocus /></div>
            <div className="form-group"><label className="form-label" htmlFor="tx-date">Data</label><input id="tx-date" className="form-input" type="date" max={todayISO} value={txForm.occurred_on} onChange={e => setTxForm({ ...txForm, occurred_on: e.target.value })} /></div>
            <div className="form-group full"><label className="form-label" htmlFor="tx-note">Observação (opcional)</label><input id="tx-note" className="form-input" maxLength={100} value={txForm.note} onChange={e => setTxForm({ ...txForm, note: e.target.value })} placeholder="Aporte de julho" /></div>
            {error && <div className="form-hint hint-warn full">{error}</div>}
          </div>
          <div className="modal-ft"><button className="nav-btn" onClick={() => setTxModal(false)}>Cancelar</button><button className="btn-ai" onClick={saveTransaction} disabled={busy}>{busy ? 'Salvando…' : 'Registrar'}</button></div>
        </div>
      </div>

      <div className={`modal-backdrop ${confirmDelete ? 'open' : ''}`} role="presentation" onMouseDown={() => setConfirmDelete(null)}>
        <div className="modal-box confirm-modal" role="dialog" aria-modal="true" aria-labelledby="delete-goal-title" onMouseDown={event => event.stopPropagation()}>
          <div className="modal-hd"><div id="delete-goal-title" className="modal-title">Excluir caixinha</div><button className="modal-close" onClick={() => setConfirmDelete(null)} aria-label="Fechar"><IconClose size={16} /></button></div>
          <div className="modal-bd"><p className="confirm-copy">A caixinha <strong>{confirmDelete?.name}</strong> e todo o histórico de aportes serão apagados. Isso não altera seus lançamentos.</p></div>
          <div className="modal-ft"><button className="nav-btn" onClick={() => setConfirmDelete(null)}>Cancelar</button><button className="btn-ai danger-btn" onClick={deleteGoal}>Excluir caixinha</button></div>
        </div>
      </div>
    </div>
  )
}
