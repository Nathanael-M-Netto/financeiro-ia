'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { formatCurrency, monthIdxForDate } from '@/lib/finance-engine'
import { MONTHS_NAMES } from '@/lib/constants'
import { cardChipStyle } from '@/lib/cards'
import { categorize, CATEGORY_META, CATEGORY_KEYS } from '@/lib/categorize'
import { IconPlus, IconPencil, IconTrash, IconClose } from '@/lib/icons'

function DetailRow({ label, value, mono }) {
  return (
    <div className="detail-row">
      <span className="detail-row-label">{label}</span>
      <span className={`detail-row-value ${mono ? 'mono' : ''}`}>{value}</span>
    </div>
  )
}

const EMPTY = {
  description: '', amount: '', card_id: '', category: '',
  start_month: 0, total_installments: 1, total_months: 1,
  pay_day: '', is_fee: false,
}

export default function LancamentosClient({ initialExpenses, initialIncomes, cards, userId }) {
  const router = useRouter()
  const supabase = createClient()

  const [expenses, setExpenses] = useState(initialExpenses)
  const [incomes, setIncomes] = useState(initialIncomes)
  const [showModal, setShowModal] = useState(false)
  const [formType, setFormType] = useState('despesa')
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [confirmClearAll, setConfirmClearAll] = useState(false)
  const [selected, setSelected] = useState(null)
  const [catTouched, setCatTouched] = useState(false) // se o usuário escolheu a categoria na mão
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' })

  const showToast = (message, type = 'success') => {
    setToast({ show: true, message, type })
    setTimeout(() => setToast({ show: false, message: '', type }), 3500)
  }

  const cardFor = (e) =>
    cards.find(c => c.id === e.card_id) || cards.find(c => c.key === e.card) || null

  const reload = async () => {
    const [{ data: ex }, { data: inc }] = await Promise.all([
      supabase.from('expenses').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
      supabase.from('extra_income').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
    ])
    if (ex) setExpenses(ex)
    if (inc) setIncomes(inc)
    router.refresh()
  }

  // Preenche a categoria das despesas sem categoria, deduzindo pelo nome.
  const categorizeAll = async () => {
    const toUpdate = expenses
      .filter(e => !e.category)
      .map(e => ({ id: e.id, category: categorize(e.description) }))
      .filter(x => x.category)
    if (toUpdate.length === 0) { showToast('Nada novo para categorizar.', 'success'); return }
    setBusy(true)
    try {
      for (const u of toUpdate) {
        const { error } = await supabase.from('expenses').update({ category: u.category }).eq('id', u.id).eq('user_id', userId)
        if (error) throw error
      }
      await reload()
      showToast(`${toUpdate.length} despesa(s) categorizada(s).`)
    } catch (e) {
      showToast(`Erro: ${e.message}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  const openAdd = (type) => {
    setFormType(type)
    setEditingId(null)
    setCatTouched(false)
    setForm({ ...EMPTY, start_month: monthIdxForDate(), card_id: type === 'despesa' && cards[0] ? cards[0].id : '' })
    setShowModal(true)
  }

  // Atualiza a descrição e, se o usuário ainda não escolheu categoria na mão, sugere uma pelo nome.
  const onDescChange = (val) => {
    setForm(f => ({
      ...f,
      description: val,
      category: (formType === 'despesa' && !catTouched) ? (categorize(val) || '') : f.category,
    }))
  }

  const openEditExpense = (e) => {
    setFormType('despesa')
    setEditingId(e.id)
    setCatTouched(true)
    setForm({
      description: e.description || '', amount: e.amount ?? '', category: e.category || '',
      card_id: e.card_id || (cards.find(c => c.key === e.card)?.id) || '',
      start_month: e.start_month || 0, total_installments: e.total_installments || 1,
      total_months: 1, pay_day: e.pay_day ?? '', is_fee: !!e.is_fee,
    })
    setShowModal(true)
  }

  const openEditIncome = (i) => {
    setFormType('receita')
    setEditingId(i.id)
    setForm({
      description: i.description || '', amount: i.amount ?? '', card_id: '',
      start_month: i.start_month || 0, total_installments: 1,
      total_months: i.total_months || 1, pay_day: i.pay_day ?? '', is_fee: false,
    })
    setShowModal(true)
  }

  const save = async () => {
    if (!form.description.trim()) { showToast('Dê uma descrição.', 'error'); return }
    const amount = Number(form.amount)
    if (!isFinite(amount) || amount <= 0) { showToast('Informe um valor válido (maior que zero).', 'error'); return }
    const day = form.pay_day === '' ? null : parseInt(form.pay_day, 10)
    if (day !== null && (isNaN(day) || day < 1 || day > 31)) { showToast('O dia deve ser entre 1 e 31.', 'error'); return }
    if (formType === 'despesa') {
      const p = Number(form.total_installments)
      if (!isFinite(p) || p < 1 || p > 360) { showToast('Parcelas inválidas (de 1 a 360).', 'error'); return }
    } else {
      const mm = Number(form.total_months)
      if (!isFinite(mm) || mm < 1 || mm > 360) { showToast('Duração inválida (de 1 a 360 meses).', 'error'); return }
    }

    setBusy(true)
    try {
      if (formType === 'despesa') {
        const card = cards.find(c => c.id === form.card_id)
        const payload = {
          user_id: userId,
          description: form.description.trim(),
          amount,
          card: card ? (card.key || card.name.toLowerCase()) : 'extra',
          card_id: form.card_id || null,
          category: form.category || null,
          start_month: Number(form.start_month) || 0,
          total_installments: Number(form.total_installments) || 1,
          pay_day: form.pay_day === '' ? null : parseInt(form.pay_day, 10),
          is_fee: !!form.is_fee,
          source: 'manual',
        }
        const q = editingId
          ? supabase.from('expenses').update(payload).eq('id', editingId)
          : supabase.from('expenses').insert(payload)
        const { error } = await q
        if (error) throw error
      } else {
        const payload = {
          user_id: userId,
          description: form.description.trim(),
          amount,
          start_month: Number(form.start_month) || 0,
          total_months: Number(form.total_months) || 1,
          pay_day: form.pay_day === '' ? null : parseInt(form.pay_day, 10),
          source: 'manual',
        }
        const q = editingId
          ? supabase.from('extra_income').update(payload).eq('id', editingId)
          : supabase.from('extra_income').insert(payload)
        const { error } = await q
        if (error) throw error
      }
      setShowModal(false)
      await reload()
      showToast(editingId ? 'Lançamento atualizado.' : 'Lançamento adicionado.')
    } catch (e) {
      showToast(`Erro: ${e.message}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  const doDelete = async () => {
    if (!confirmDelete) return
    setBusy(true)
    try {
      const table = confirmDelete.kind === 'despesa' ? 'expenses' : 'extra_income'
      const { error } = await supabase.from(table).delete().eq('id', confirmDelete.id).eq('user_id', userId)
      if (error) throw error
      setConfirmDelete(null)
      setSelected(null)
      await reload()
      showToast('Lançamento excluído.')
    } catch (e) {
      showToast(`Erro: ${e.message}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  const clearAll = async () => {
    setBusy(true)
    try {
      const [r1, r2] = await Promise.all([
        supabase.from('expenses').delete().eq('user_id', userId),
        supabase.from('extra_income').delete().eq('user_id', userId),
      ])
      if (r1.error) throw r1.error
      if (r2.error) throw r2.error
      setConfirmClearAll(false)
      await reload()
      showToast('Todos os lançamentos foram apagados.')
    } catch (e) {
      showToast(`Erro: ${e.message}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  const monthName = (idx) => MONTHS_NAMES[idx] || '—'

  const selectedItem = selected
    ? (selected.kind === 'despesa'
        ? expenses.find(e => e.id === selected.id)
        : incomes.find(i => i.id === selected.id))
    : null

  return (
    <div className="cards-page">
      <header className="app-topbar">
        <div>
          <h1 className="page-title">Lançamentos</h1>
          <p className="page-sub">Adicione, edite ou exclua despesas e receitas manualmente.</p>
        </div>
        <div className="lanc-add-actions">
          {expenses.some(e => !e.category) && (
            <button className="btn-ghost" onClick={categorizeAll} disabled={busy} title="Preenche a categoria pelo nome">Auto-categorizar</button>
          )}
          <button className="btn-soft-neg" onClick={() => openAdd('despesa')}><IconPlus size={16} /> Nova despesa</button>
          <button className="btn-soft-pos" onClick={() => openAdd('receita')}><IconPlus size={16} /> Nova receita</button>
        </div>
      </header>

      <div className="lanc-layout">
        <div className="lanc-main">
          {/* DESPESAS */}
          <section className="card" style={{ marginBottom: '18px' }}>
            <div className="card-header">
              <span className="timeline-title" style={{ marginBottom: 0 }}>Despesas</span>
              <span className="lanc-count">{expenses.length}</span>
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              {expenses.length === 0 ? (
                <div className="lanc-empty">Nenhuma despesa. Clique em “Nova despesa”.</div>
              ) : (
                <table className="exp-table exp-table-rows">
                  <thead>
                    <tr>
                      <th>Descrição</th>
                      <th>Cartão</th>
                      <th>Início</th>
                      <th className="align-center" style={{ textAlign: 'center' }}>Parc.</th>
                      <th className="align-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenses.map((e) => {
                      const c = cardFor(e)
                      const sel = selected?.kind === 'despesa' && selected.id === e.id
                      return (
                        <tr key={e.id} className={`row-click ${sel ? 'row-selected' : ''}`} onClick={() => setSelected({ kind: 'despesa', id: e.id })}>
                          <td>{e.is_fee ? '⚠ ' : ''}{e.description || 'Despesa'}</td>
                          <td>{c ? <span className="tag" style={cardChipStyle(c.color)}>{c.name}</span> : (e.card || '—')}</td>
                          <td>{monthName(e.start_month)}{e.pay_day ? <span className="row-sub"> · dia {e.pay_day}</span> : null}</td>
                          <td style={{ textAlign: 'center' }}><span className="inst-badge">{e.is_fee ? '—' : `${e.total_installments}x`}</span></td>
                          <td className="amt-col">{formatCurrency(parseFloat(e.amount) || 0)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          {/* RECEITAS */}
          <section className="card">
            <div className="card-header">
              <span className="timeline-title" style={{ marginBottom: 0 }}>Receitas</span>
              <span className="lanc-count">{incomes.length}</span>
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              {incomes.length === 0 ? (
                <div className="lanc-empty">Nenhuma receita. Clique em “Nova receita”.</div>
              ) : (
                <table className="exp-table exp-table-rows">
                  <thead>
                    <tr>
                      <th>Descrição</th>
                      <th>Início</th>
                      <th className="align-center" style={{ textAlign: 'center' }}>Duração</th>
                      <th className="align-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {incomes.map((i) => {
                      const sel = selected?.kind === 'receita' && selected.id === i.id
                      return (
                        <tr key={i.id} className={`row-click ${sel ? 'row-selected' : ''}`} onClick={() => setSelected({ kind: 'receita', id: i.id })}>
                          <td>{i.description || 'Receita'}</td>
                          <td>{monthName(i.start_month)}{i.pay_day ? <span className="row-sub"> · dia {i.pay_day}</span> : null}</td>
                          <td style={{ textAlign: 'center' }}><span className="inst-badge">{i.total_months || 1} m</span></td>
                          <td className="amt-col pos">{formatCurrency(parseFloat(i.amount) || 0)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </div>

        {/* PAINEL DE DETALHES (estilo Supabase) */}
        <aside className={`detail-panel ${selectedItem ? 'open' : ''}`}>
          {!selectedItem ? (
            <div className="detail-empty">Selecione um lançamento na tabela para ver os detalhes.</div>
          ) : (
            <>
              <div className="detail-head">
                <div>
                  <div className="detail-kind">{selected.kind === 'despesa' ? 'Despesa' : 'Receita'}</div>
                  <div className="detail-title">{selectedItem.description || (selected.kind === 'despesa' ? 'Despesa' : 'Receita')}</div>
                </div>
                <button className="detail-close" onClick={() => setSelected(null)} aria-label="Fechar"><IconClose size={16} /></button>
              </div>
              <div className="detail-amount" style={{ color: selected.kind === 'despesa' ? 'var(--neg)' : 'var(--pos)' }}>
                {selected.kind === 'despesa' ? '-' : '+'}{formatCurrency(parseFloat(selectedItem.amount) || 0)}
              </div>
              <div className="detail-rows">
                {selected.kind === 'despesa' ? (
                  <>
                    <DetailRow label="Cartão" value={cardFor(selectedItem)?.name || selectedItem.card || '—'} />
                    <DetailRow label="Categoria" value={selectedItem.category && CATEGORY_META[selectedItem.category] ? CATEGORY_META[selectedItem.category].name : '—'} />
                    <DetailRow label="Mês de início" value={monthName(selectedItem.start_month)} />
                    <DetailRow label="Parcelas" value={selectedItem.is_fee ? '—' : `${selectedItem.total_installments}x`} mono />
                    <DetailRow label="Vencimento" value={selectedItem.pay_day ? `dia ${selectedItem.pay_day}` : '—'} mono />
                    <DetailRow label="Juros/multa" value={selectedItem.is_fee ? 'Sim' : 'Não'} />
                  </>
                ) : (
                  <>
                    <DetailRow label="Mês de início" value={monthName(selectedItem.start_month)} />
                    <DetailRow label="Duração" value={`${selectedItem.total_months || 1} ${(selectedItem.total_months || 1) > 1 ? 'meses' : 'mês'}`} />
                    <DetailRow label="Pagamento" value={selectedItem.pay_day ? `dia ${selectedItem.pay_day}` : '—'} mono />
                  </>
                )}
                <DetailRow label="Origem" value={selectedItem.source === 'ai' ? 'IA' : 'Manual'} />
              </div>
              <div className="detail-actions">
                <button className="btn-ghost" onClick={() => selected.kind === 'despesa' ? openEditExpense(selectedItem) : openEditIncome(selectedItem)}><IconPencil size={14} /> Editar</button>
                <button className="btn-soft-neg" onClick={() => setConfirmDelete({ kind: selected.kind, id: selectedItem.id, label: selectedItem.description || 'Lançamento' })}><IconTrash size={14} /> Excluir</button>
              </div>
            </>
          )}
        </aside>
      </div>

      {/* Zona de perigo */}
      {(expenses.length > 0 || incomes.length > 0) && (
        <section className="danger-zone">
          <div>
            <div className="danger-zone-title">Apagar tudo</div>
            <div className="danger-zone-desc">Remove todas as despesas e receitas de uma vez. Não afeta seus cartões.</div>
          </div>
          <button className="btn-danger" onClick={() => setConfirmClearAll(true)}><IconTrash size={15} /> Apagar tudo</button>
        </section>
      )}

      {/* Modal de adicionar/editar */}
      <div className={`modal-backdrop ${showModal ? 'open' : ''}`}>
        <div className="modal-box">
          <div className="modal-hd">
            <div style={{ fontWeight: 800, fontSize: '.9rem', color: '#fff' }}>
              {editingId ? 'Editar' : 'Nova'} {formType === 'despesa' ? 'despesa' : 'receita'}
            </div>
            <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
          </div>
          <div className="modal-bd">
            <div className="form-group">
              <label className="form-label">Descrição</label>
              <input className="form-input" value={form.description} maxLength={80}
                onChange={e => onDescChange(e.target.value)}
                placeholder={formType === 'despesa' ? 'Ex: Mercado, Netflix, Uber...' : 'Ex: Salário'} />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Valor (R$)</label>
                <input className="form-input" type="number" min="0" step="0.01" value={form.amount}
                  onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="0,00" />
              </div>
              <div className="form-group">
                <label className="form-label">Mês de início</label>
                <select className="form-input" value={form.start_month}
                  onChange={e => setForm({ ...form, start_month: e.target.value })}>
                  {MONTHS_NAMES.map((m, i) => <option key={i} value={i}>{m}</option>)}
                </select>
              </div>
            </div>

            {formType === 'despesa' ? (
              <>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Cartão</label>
                    <select className="form-input" value={form.card_id}
                      onChange={e => setForm({ ...form, card_id: e.target.value })}>
                      <option value="">Sem cartão / Extra</option>
                      {cards.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Parcelas</label>
                    <input className="form-input" type="number" min="1" max="48" value={form.total_installments}
                      onChange={e => setForm({ ...form, total_installments: e.target.value })} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Categoria {!catTouched && form.category ? <span style={{ color: 'var(--info)', fontWeight: 700 }}>· sugerida pelo nome</span> : null}</label>
                  <select className="form-input" value={form.category}
                    onChange={e => { setCatTouched(true); setForm({ ...form, category: e.target.value }) }}>
                    <option value="">Sem categoria</option>
                    {CATEGORY_KEYS.map(k => <option key={k} value={k}>{CATEGORY_META[k].name}</option>)}
                  </select>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Dia de vencimento</label>
                    <input className="form-input" type="number" min="1" max="31" value={form.pay_day}
                      onChange={e => setForm({ ...form, pay_day: e.target.value })} placeholder="1–31" />
                  </div>
                  <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
                    <label className="form-check">
                      <input type="checkbox" checked={form.is_fee}
                        onChange={e => setForm({ ...form, is_fee: e.target.checked })} />
                      É juros/multa
                    </label>
                  </div>
                </div>
              </>
            ) : (
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Duração (meses)</label>
                  <input className="form-input" type="number" min="1" max="12" value={form.total_months}
                    onChange={e => setForm({ ...form, total_months: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Dia de pagamento</label>
                  <input className="form-input" type="number" min="1" max="31" value={form.pay_day}
                    onChange={e => setForm({ ...form, pay_day: e.target.value })} placeholder="1–31" />
                </div>
              </div>
            )}
          </div>
          <div className="modal-ft">
            <button className="nav-btn" onClick={() => setShowModal(false)}>Cancelar</button>
            <button className="btn-ai" onClick={save} disabled={busy}>{busy ? 'Salvando...' : 'Salvar'}</button>
          </div>
        </div>
      </div>

      {/* Confirmar exclusão */}
      <div className={`modal-backdrop ${confirmDelete ? 'open' : ''}`}>
        <div className="modal-box" style={{ maxWidth: '380px' }}>
          <div className="modal-hd">
            <div style={{ fontWeight: 800, fontSize: '.9rem', color: '#fff' }}>Excluir lançamento</div>
            <button className="modal-close" onClick={() => setConfirmDelete(null)}>✕</button>
          </div>
          <div className="modal-bd">
            <p style={{ fontSize: '.85rem', color: 'var(--text2)', lineHeight: 1.6 }}>
              Excluir <strong style={{ color: 'var(--text)' }}>{confirmDelete?.label}</strong>? Esta ação não pode ser desfeita.
            </p>
          </div>
          <div className="modal-ft">
            <button className="nav-btn" onClick={() => setConfirmDelete(null)}>Cancelar</button>
            <button className="btn-ai" style={{ background: 'var(--neg)' }} onClick={doDelete} disabled={busy}>
              {busy ? 'Excluindo...' : 'Excluir'}
            </button>
          </div>
        </div>
      </div>

      {/* Confirmar apagar tudo */}
      <div className={`modal-backdrop ${confirmClearAll ? 'open' : ''}`}>
        <div className="modal-box" style={{ maxWidth: '400px' }}>
          <div className="modal-hd">
            <div style={{ fontWeight: 800, fontSize: '.9rem', color: '#fff' }}>Apagar todos os lançamentos</div>
            <button className="modal-close" onClick={() => setConfirmClearAll(false)}>✕</button>
          </div>
          <div className="modal-bd">
            <p style={{ fontSize: '.85rem', color: 'var(--text2)', lineHeight: 1.6 }}>
              Isso apaga <strong style={{ color: 'var(--text)' }}>todas as {expenses.length} despesas e {incomes.length} receitas</strong>. Esta ação não pode ser desfeita. Seus cartões não são afetados.
            </p>
          </div>
          <div className="modal-ft">
            <button className="btn-ghost" onClick={() => setConfirmClearAll(false)}>Cancelar</button>
            <button className="btn-danger" onClick={clearAll} disabled={busy}>{busy ? 'Apagando...' : 'Sim, apagar tudo'}</button>
          </div>
        </div>
      </div>

      <div className={`toast ${toast.type} ${toast.show ? 'show' : ''}`}>{toast.message}</div>
    </div>
  )
}
