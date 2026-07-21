'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { formatCurrency, monthIdxForDate, invoiceSlotForPurchase } from '@/lib/finance-engine'
import { MONTHS_NAMES } from '@/lib/constants'
import { cardChipStyle } from '@/lib/cards'
import { categorize, CATEGORY_META, CATEGORY_KEYS, normalizeMerchantName } from '@/lib/categorize'
import { IconPlus, IconPencil, IconTrash, IconClose, IconRepeat, IconAlert, IconDownload, IconSparkles, IconWallet } from '@/lib/icons'

// Data de hoje (local) como 'YYYY-MM-DD' para o <input type="date">.
function isoDate(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Converte 'YYYY-MM-DD' em Date local (00:00), sem o deslize de fuso do new Date(string).
function parseISO(s) {
  if (!s) return new Date()
  const [y, m, d] = String(s).split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

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
  pay_day: '', is_fee: false, purchase_date: '', is_recurring: false,
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
  const toastTimer = useRef(null)
  // Filtros das listas
  const [filterText, setFilterText] = useState('')
  const [filterCard, setFilterCard] = useState('') // '' = todos · 'extra' = à vista · senão card_id
  const currentMonthFilter = String(monthIdxForDate())
  const [filterMonth, setFilterMonth] = useState(currentMonthFilter) // abre sempre no mês atual
  const [filterFixed, setFilterFixed] = useState(false) // true = só fixos mensais

  const showToast = (message, type = 'success') => {
    // Cancela o timer anterior — senão um toast antigo apaga o novo antes da hora.
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast({ show: true, message, type })
    toastTimer.current = setTimeout(() => setToast({ show: false, message: '', type }), 3500)
  }

  const cardFor = (e) =>
    cards.find(c => c.id === e.card_id) || cards.find(c => c.key === e.card) || null

  // Dia de vencimento EFETIVO: despesas de cartão seguem o cartão (fonte única);
  // à vista usa o dia do próprio gasto.
  const effectiveDay = (e) => {
    const c = cardFor(e)
    const isCash = e.card === 'extra' || c?.key === 'extra'
    if (isCash) return e.pay_day || null
    return c?.due_day || e.pay_day || null
  }

  const reload = async () => {
    const [{ data: ex }, { data: inc }] = await Promise.all([
      supabase.from('expenses').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
      supabase.from('extra_income').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
    ])
    if (ex) setExpenses(ex)
    if (inc) setIncomes(inc)
    router.refresh()
  }

  // Regra local -> memória pessoal -> pesquisa web em lote -> Outros.
  const categorizeAll = async () => {
    if (!expenses.some(e => !e.category)) { showToast('Nada novo para categorizar.', 'success'); return }
    setBusy(true)
    try {
      const response = await fetch('/api/categorize', { method: 'POST' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Não foi possível categorizar.')
      await reload()
      const details = [
        result.researched ? `${result.researched} pesquisada(s)` : null,
        result.saved ? `${result.saved} da sua memória` : null,
        result.fallback ? `${result.fallback} em Outros` : null,
      ].filter(Boolean).join(' · ')
      showToast(`${result.updated} despesa(s) categorizada(s)${details ? ` — ${details}` : ''}.`)
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
    // Novo lançamento começa pela DATA (hoje). Despesa começa "à vista" (sem cartão),
    // que é o caso mais comum (Pix/dinheiro/débito); o usuário escolhe o cartão se quiser.
    setForm({ ...EMPTY, start_month: monthIdxForDate(), purchase_date: isoDate(), card_id: '' })
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
      purchase_date: '', is_recurring: !!e.is_recurring,
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
      purchase_date: '', is_recurring: !!i.is_recurring,
    })
    setShowModal(true)
  }

  const save = async () => {
    if (!form.description.trim()) { showToast('Dê uma descrição.', 'error'); return }
    const amount = Number(form.amount)
    if (!isFinite(amount) || amount <= 0) { showToast('Informe um valor válido (maior que zero).', 'error'); return }

    // Mês de início e dia: na EDIÇÃO usa os campos manuais (preserva o que já existe);
    // num lançamento NOVO, deriva da data (e, para despesa em cartão, do ciclo de fatura).
    let start_month, pay_day, paidThrough
    if (editingId) {
      start_month = Number(form.start_month) || 0
      const d = form.pay_day === '' ? null : parseInt(form.pay_day, 10)
      if (d !== null && (isNaN(d) || d < 1 || d > 31)) { showToast('O dia deve ser entre 1 e 31.', 'error'); return }
      pay_day = d
    } else {
      const pdate = parseISO(form.purchase_date)
      if (!form.purchase_date || isNaN(pdate)) { showToast('Informe uma data válida.', 'error'); return }
      if (formType === 'despesa' && form.card_id) {
        const card = cards.find(c => c.id === form.card_id)
        const slot = invoiceSlotForPurchase(card, pdate)
        start_month = slot.startMonthIdx
        pay_day = slot.payDay
      } else {
        // À vista (Pix/dinheiro/débito) ou receita: cai no mês/dia da própria data.
        start_month = monthIdxForDate(pdate)
        pay_day = pdate.getDate()
        // Dinheiro que já saiu (despesa à vista com data de hoje ou passada) => já pago.
        if (formType === 'despesa' && !form.card_id && pdate <= new Date()) paidThrough = start_month
      }
    }

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
        // À vista é pagamento único; parcelamento só faz sentido no cartão.
        // Fixa mensal ignora parcelas (repete até o fim do horizonte).
        const installments = (form.is_recurring || !form.card_id) ? 1 : (Number(form.total_installments) || 1)
        const payload = {
          user_id: userId,
          description: form.description.trim(),
          amount,
          card: card ? (card.key || card.name.toLowerCase()) : 'extra',
          card_id: form.card_id || null,
          category: form.category || null,
          start_month,
          total_installments: installments,
          pay_day,
          is_fee: !!form.is_fee,
          is_recurring: !!form.is_recurring,
          source: 'manual',
        }
        if (paidThrough !== undefined) payload.paid_through = paidThrough
        let { error } = await (editingId
          ? supabase.from('expenses').update(payload).eq('id', editingId)
          : supabase.from('expenses').insert(payload))
        // Banco ainda sem a coluna is_recurring (migration 0006)? Salva sem ela.
        if (error && /is_recurring/i.test(error.message || '')) {
          const { is_recurring: _skip, ...rest } = payload
          ;({ error } = await (editingId
            ? supabase.from('expenses').update(rest).eq('id', editingId)
            : supabase.from('expenses').insert(rest)))
        }
        if (error) throw error
        // Uma escolha manual vira memória pessoal para os próximos extratos.
        if (payload.category) {
          const merchantKey = normalizeMerchantName(payload.description)
          if (merchantKey) await supabase.from('merchant_category_rules').upsert({
            user_id: userId,
            merchant_key: merchantKey,
            display_name: payload.description.slice(0, 120),
            category: payload.category,
            source: 'manual',
            confidence: 1,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id,merchant_key' })
        }
      } else {
        const payload = {
          user_id: userId,
          description: form.description.trim(),
          amount,
          start_month,
          total_months: form.is_recurring ? 1 : (Number(form.total_months) || 1),
          pay_day,
          is_recurring: !!form.is_recurring,
          source: 'manual',
        }
        let { error } = await (editingId
          ? supabase.from('extra_income').update(payload).eq('id', editingId)
          : supabase.from('extra_income').insert(payload))
        // Banco ainda sem a coluna is_recurring (migration 0007)? Salva sem ela.
        if (error && /is_recurring/i.test(error.message || '')) {
          const { is_recurring: _skip, ...rest } = payload
          ;({ error } = await (editingId
            ? supabase.from('extra_income').update(rest).eq('id', editingId)
            : supabase.from('extra_income').insert(rest)))
        }
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

  // Exporta todos os lançamentos como CSV (abre direto no Excel/Sheets).
  const exportCsv = () => {
    const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`
    const money = (v) => String(parseFloat(v) || 0).replace('.', ',')
    const rows = [['tipo', 'descricao', 'cartao', 'categoria', 'mes_inicio', 'dia', 'parcelas/meses', 'fixa', 'valor'].join(';')]
    expenses.forEach(e => rows.push([
      'despesa', e.description || '', cardFor(e)?.name || e.card || '', e.category ? (CATEGORY_META[e.category]?.name || e.category) : '',
      monthName(e.start_month), e.pay_day ?? '', e.is_recurring ? '' : `${e.total_installments}x`, e.is_recurring ? 'sim' : 'nao', money(e.amount),
    ].map(esc).join(';')))
    incomes.forEach(i => rows.push([
      'receita', i.description || '', '', '',
      monthName(i.start_month), i.pay_day ?? '', i.is_recurring ? '' : `${i.total_months || 1} meses`, i.is_recurring ? 'sim' : 'nao', money(i.amount),
    ].map(esc).join(';')))
    // BOM p/ o Excel reconhecer acentos; ponto-e-vírgula é o separador padrão BR.
    const blob = new Blob(['﻿' + rows.join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'findash-lancamentos.csv'
    a.click()
    URL.revokeObjectURL(a.href)
    showToast('CSV exportado.')
  }

  // Marca/desmarca um lançamento como FIXO mensal direto do painel (sem abrir o form).
  const toggleRecurring = async (kind, item) => {
    setBusy(true)
    try {
      const table = kind === 'despesa' ? 'expenses' : 'extra_income'
      const next = !item.is_recurring
      const patch = next && kind === 'despesa' ? { is_recurring: true, total_installments: 1 } : { is_recurring: next }
      const { error } = await supabase.from(table).update(patch).eq('id', item.id).eq('user_id', userId)
      if (error) {
        // Banco ainda sem a coluna (migration 0006/0007)? Avisa em vez de quebrar.
        if (/is_recurring/i.test(error.message || '')) {
          showToast(kind === 'despesa'
            ? 'Rode a migration 0006 no Supabase para ativar despesas fixas.'
            : 'Rode a migration 0007 no Supabase para ativar receitas fixas.', 'error')
          return
        }
        throw error
      }
      await reload()
      showToast(next ? 'Agora é fixo mensal — vale todo mês até você desfazer.' : 'Não é mais fixo mensal.')
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

  // Listas filtradas (texto / cartão / mês). Cartão só afeta despesas.
  const matchText = (desc) => !filterText || (desc || '').toLowerCase().includes(filterText.toLowerCase())
  const activeInMonth = (item, kind) => {
    if (filterMonth === '') return true
    const month = Number(filterMonth)
    const start = Number(item.start_month) || 0
    if (item.is_recurring) return month >= start
    const length = kind === 'despesa' ? (Number(item.total_installments) || 1) : (Number(item.total_months) || 1)
    return month >= start && month < start + length
  }
  const fExpenses = expenses.filter(e => {
    if (!matchText(e.description)) return false
    if (!activeInMonth(e, 'despesa')) return false
    if (filterFixed && !e.is_recurring) return false
    if (filterCard === 'extra' && e.card_id) return false
    if (filterCard && filterCard !== 'extra' && e.card_id !== filterCard) return false
    return true
  })
  const fIncomes = incomes.filter(i => matchText(i.description) && activeInMonth(i, 'receita') && (!filterFixed || i.is_recurring))
  const filtersActive = filterText !== '' || filterCard !== '' || filterMonth !== currentMonthFilter || filterFixed
  const listIsFiltered = filterText !== '' || filterCard !== '' || filterMonth !== '' || filterFixed
  const selectedPeriod = filterMonth === '' ? 'Todos os meses' : monthName(Number(filterMonth))
  const visibleOut = fExpenses.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
  const visibleIn = fIncomes.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
  const uncategorized = fExpenses.filter(item => !item.category).length

  const selectedItem = selected
    ? (selected.kind === 'despesa'
        ? expenses.find(e => e.id === selected.id)
        : incomes.find(i => i.id === selected.id))
    : null

  // Prévia de "onde cai" o lançamento novo, a partir da data escolhida (só no modo novo).
  const preview = (() => {
    if (editingId || !form.purchase_date) return null
    const pdate = parseISO(form.purchase_date)
    if (isNaN(pdate)) return null
    const fixa = formType === 'despesa' && form.is_recurring
    if (formType === 'despesa' && form.card_id) {
      const card = cards.find(c => c.id === form.card_id)
      const s = invoiceSlotForPurchase(card, pdate)
      return { tone: 'card', text: fixa
        ? `Fixa mensal — todo mês a partir da fatura de ${MONTHS_NAMES[s.startMonthIdx]} · vence dia ${s.payDay}`
        : `Entra na fatura de ${MONTHS_NAMES[s.startMonthIdx]} · vence dia ${s.payDay}` }
    }
    const idx = monthIdxForDate(pdate)
    if (formType === 'receita') {
      return { tone: 'pos', text: form.is_recurring
        ? `Fixa mensal — entra todo mês a partir de ${MONTHS_NAMES[idx]} · dia ${pdate.getDate()}`
        : `Começa em ${MONTHS_NAMES[idx]} · dia ${pdate.getDate()}` }
    }
    if (fixa) {
      return { tone: 'card', text: `Fixa mensal — todo mês a partir de ${MONTHS_NAMES[idx]} · dia ${pdate.getDate()} (este mês já marcado como pago)` }
    }
    const paid = pdate <= new Date()
    return paid
      ? { tone: 'pos', text: `À vista — sai dia ${pdate.getDate()} de ${MONTHS_NAMES[idx]} · já marcado como pago` }
      : { tone: 'warn', text: `Agendado — sai dia ${pdate.getDate()} de ${MONTHS_NAMES[idx]} (ainda não pago)` }
  })()

  return (
    <div className="page legacy-page lanc-page anim">
      <header className="app-topbar legacy-topbar">
        <div>
          <h1 className="page-title">Lançamentos</h1>
          <p className="page-sub">Movimentações de {selectedPeriod.toLowerCase()}, com despesas, receitas e recorrências no mesmo lugar.</p>
        </div>
        <div className="lanc-add-actions">
          {(expenses.length > 0 || incomes.length > 0) && (
            <button className="btn-ghost" onClick={exportCsv} title="Baixa um CSV com todos os lançamentos (abre no Excel)"><IconDownload size={14} /> Exportar</button>
          )}
          {expenses.some(e => !e.category) && (
            <button className="btn-ghost" onClick={categorizeAll} disabled={busy} title="Usa regras, sua memória e pesquisa para nomes desconhecidos"><IconSparkles size={14} /> Categorizar</button>
          )}
          <button className="btn-soft-neg" onClick={() => openAdd('despesa')}><IconPlus size={16} /> Nova despesa</button>
          <button className="btn-soft-pos" onClick={() => openAdd('receita')}><IconPlus size={16} /> Nova receita</button>
        </div>
      </header>

      <section className="legacy-overview lanc-overview" aria-label={`Resumo de ${selectedPeriod}`}>
        <div className="legacy-kpi primary"><span className="legacy-kpi-icon"><IconWallet size={18} /></span><div><span>Período selecionado</span><strong>{selectedPeriod}</strong></div></div>
        <div className="legacy-kpi positive"><span>Entradas</span><strong>{formatCurrency(visibleIn)}</strong><small>{fIncomes.length} lançamento(s)</small></div>
        <div className="legacy-kpi negative"><span>Saídas</span><strong>{formatCurrency(visibleOut)}</strong><small>{fExpenses.length} lançamento(s)</small></div>
        <div className="legacy-kpi"><span>Resultado do período</span><strong className={visibleIn - visibleOut >= 0 ? 'pos' : 'neg'}>{formatCurrency(visibleIn - visibleOut)}</strong><small>{uncategorized ? `${uncategorized} sem categoria` : 'Categorias em dia'}</small></div>
      </section>

      <div className="lanc-layout">
        <div className="lanc-main">
          {/* FILTROS */}
          {(expenses.length > 0 || incomes.length > 0) && (
            <div className="lanc-filters">
              <input className="form-input lanc-filter-search" placeholder="Buscar por descrição…"
                value={filterText} onChange={e => setFilterText(e.target.value)} />
              <select className="form-input" aria-label="Filtrar por cartão ou forma de pagamento" value={filterCard} onChange={e => setFilterCard(e.target.value)}>
                <option value="">Todos os cartões</option>
                <option value="extra">À vista (Pix / dinheiro)</option>
                {cards.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select className="form-input" aria-label="Filtrar por mês" value={filterMonth} onChange={e => setFilterMonth(e.target.value)}>
                <option value="">Todos os meses</option>
                {MONTHS_NAMES.map((m, index) => <option key={index} value={index}>{m}</option>)}
              </select>
              <button className={`btn-ghost ${filterFixed ? 'fix-on' : ''}`} onClick={() => setFilterFixed(v => !v)}
                title="Mostrar só despesas e receitas fixas mensais"><IconRepeat size={13} /> Só fixos</button>
              {filtersActive && (
                <button className="btn-ghost" onClick={() => { setFilterText(''); setFilterCard(''); setFilterMonth(currentMonthFilter); setFilterFixed(false) }}>Restaurar</button>
              )}
            </div>
          )}

          {/* DESPESAS */}
          <section className="card" style={{ marginBottom: '18px' }}>
            <div className="card-header">
              <span className="timeline-title" style={{ marginBottom: 0 }}>Despesas</span>
              <span className="lanc-count">{listIsFiltered ? `${fExpenses.length}/${expenses.length}` : expenses.length}</span>
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              {expenses.length === 0 ? (
                <div className="lanc-empty">Nenhuma despesa. Clique em “Nova despesa”.</div>
              ) : fExpenses.length === 0 ? (
                <div className="lanc-empty">Nenhuma despesa com esses filtros.</div>
              ) : (
                <table className="exp-table exp-table-rows exp-table-despesas">
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
                    {fExpenses.map((e) => {
                      const c = cardFor(e)
                      const sel = selected?.kind === 'despesa' && selected.id === e.id
                      return (
                        <tr key={e.id} className={`row-click ${sel ? 'row-selected' : ''}`} onClick={() => setSelected({ kind: 'despesa', id: e.id })}>
                          <td>{e.is_fee ? <span className="fee-flag"><IconAlert size={12} /></span> : null}{e.description || 'Despesa'}</td>
                          <td>{c ? <span className="tag" style={cardChipStyle(c.color)}>{c.name}</span> : (e.card || '—')}</td>
                          <td>{monthName(e.start_month)}{effectiveDay(e) ? <span className="row-sub"> · dia {effectiveDay(e)}</span> : null}</td>
                          <td style={{ textAlign: 'center' }}><span className="inst-badge">{e.is_fee ? '—' : (e.is_recurring ? 'Fixa' : `${e.total_installments}x`)}</span></td>
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
              <span className="lanc-count">{listIsFiltered ? `${fIncomes.length}/${incomes.length}` : incomes.length}</span>
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              {incomes.length === 0 ? (
                <div className="lanc-empty">Nenhuma receita. Clique em “Nova receita”.</div>
              ) : fIncomes.length === 0 ? (
                <div className="lanc-empty">Nenhuma receita com esses filtros.</div>
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
                    {fIncomes.map((i) => {
                      const sel = selected?.kind === 'receita' && selected.id === i.id
                      return (
                        <tr key={i.id} className={`row-click ${sel ? 'row-selected' : ''}`} onClick={() => setSelected({ kind: 'receita', id: i.id })}>
                          <td>{i.description || 'Receita'}</td>
                          <td>{monthName(i.start_month)}{i.pay_day ? <span className="row-sub"> · dia {i.pay_day}</span> : null}</td>
                          <td style={{ textAlign: 'center' }}><span className="inst-badge">{i.is_recurring ? 'Fixa' : `${i.total_months || 1} m`}</span></td>
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
                    <DetailRow label="Parcelas" value={selectedItem.is_fee ? '—' : (selectedItem.is_recurring ? 'Fixa mensal' : `${selectedItem.total_installments}x`)} mono />
                    <DetailRow label="Vencimento" value={effectiveDay(selectedItem) ? `dia ${effectiveDay(selectedItem)}${cardFor(selectedItem) && cardFor(selectedItem).key !== 'extra' ? ' (do cartão)' : ''}` : '—'} mono />
                    <DetailRow label="Juros/multa" value={selectedItem.is_fee ? 'Sim' : 'Não'} />
                  </>
                ) : (
                  <>
                    <DetailRow label="Mês de início" value={monthName(selectedItem.start_month)} />
                    <DetailRow label="Duração" value={selectedItem.is_recurring ? 'Fixa mensal' : `${selectedItem.total_months || 1} ${(selectedItem.total_months || 1) > 1 ? 'meses' : 'mês'}`} />
                    <DetailRow label="Pagamento" value={selectedItem.pay_day ? `dia ${selectedItem.pay_day}` : '—'} mono />
                  </>
                )}
                <DetailRow label="Origem" value={selectedItem.source === 'ai' ? 'IA' : 'Manual'} />
              </div>
              <div className="detail-actions">
                {!selectedItem.is_fee && (
                  <button className={selectedItem.is_recurring ? 'btn-ghost fix-on' : 'btn-ghost'} disabled={busy}
                    onClick={() => toggleRecurring(selected.kind, selectedItem)}
                    title={selectedItem.is_recurring ? 'Deixa de repetir todo mês' : 'Passa a valer todo mês, sem prazo'}>
                    <IconRepeat size={14} /> {selectedItem.is_recurring ? 'Desfazer fixo' : 'Tornar fixo'}
                  </button>
                )}
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

            {formType === 'despesa' ? (
              <>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Valor (R$)</label>
                    <input className="form-input" type="number" min="0" step="0.01" value={form.amount}
                      onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="0,00" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Forma / cartão</label>
                    <select className="form-input" value={form.card_id}
                      onChange={e => setForm({ ...form, card_id: e.target.value })}>
                      <option value="">À vista (Pix / dinheiro / débito)</option>
                      {cards.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                </div>

                {editingId ? (
                  // EDIÇÃO: campos manuais, pra não alterar em silêncio o que já existe.
                  <>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">Mês de início</label>
                        <select className="form-input" value={form.start_month}
                          onChange={e => setForm({ ...form, start_month: e.target.value })}>
                          {MONTHS_NAMES.map((m, i) => <option key={i} value={i}>{m}</option>)}
                        </select>
                      </div>
                      {(!form.card_id || cards.find(c => c.id === form.card_id)?.key === 'extra') && (
                        <div className="form-group">
                          <label className="form-label">Dia de vencimento</label>
                          <input className="form-input" type="number" min="1" max="31" value={form.pay_day}
                            onChange={e => setForm({ ...form, pay_day: e.target.value })} placeholder="1–31" />
                        </div>
                      )}
                    </div>
                    {form.card_id && cards.find(c => c.id === form.card_id)?.key !== 'extra' && (
                      <div className="form-hint hint-card">
                        O vencimento segue o cartão{cards.find(c => c.id === form.card_id)?.due_day ? ` (dia ${cards.find(c => c.id === form.card_id).due_day})` : ''} — mude na tela Cartões e tudo acompanha.
                      </div>
                    )}
                  </>
                ) : form.card_id ? (
                  // NOVO no cartão: a data da compra define a fatura.
                  <>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">Data da compra</label>
                        <input className="form-input" type="date" value={form.purchase_date}
                          onChange={e => setForm({ ...form, purchase_date: e.target.value })} />
                      </div>
                      {!form.is_recurring && (
                        <div className="form-group">
                          <label className="form-label">Parcelas</label>
                          <input className="form-input" type="number" min="1" max="48" value={form.total_installments}
                            onChange={e => setForm({ ...form, total_installments: e.target.value })} />
                        </div>
                      )}
                    </div>
                    {preview && <div className={`form-hint hint-${preview.tone}`}>{preview.text}</div>}
                  </>
                ) : (
                  // NOVO à vista: a data é quando o dinheiro saiu.
                  <>
                    <div className="form-group">
                      <label className="form-label">Data (quando saiu o dinheiro)</label>
                      <input className="form-input" type="date" value={form.purchase_date}
                        onChange={e => setForm({ ...form, purchase_date: e.target.value })} />
                    </div>
                    {preview && <div className={`form-hint hint-${preview.tone}`}>{preview.text}</div>}
                  </>
                )}

                <div className="form-group">
                  <label className="form-label">Categoria {!catTouched && form.category ? <span style={{ color: 'var(--info)', fontWeight: 700 }}>· sugerida pelo nome</span> : null}</label>
                  <select className="form-input" value={form.category}
                    onChange={e => { setCatTouched(true); setForm({ ...form, category: e.target.value }) }}>
                    <option value="">Sem categoria</option>
                    {CATEGORY_KEYS.map(k => <option key={k} value={k}>{CATEGORY_META[k].name}</option>)}
                  </select>
                </div>

                <div className="form-row">
                  {editingId && !form.is_recurring && (
                    <div className="form-group">
                      <label className="form-label">Parcelas</label>
                      <input className="form-input" type="number" min="1" max="48" value={form.total_installments}
                        onChange={e => setForm({ ...form, total_installments: e.target.value })} />
                    </div>
                  )}
                  <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end', gap: '16px', flexWrap: 'wrap' }}>
                    <label className="form-check">
                      <input type="checkbox" checked={form.is_recurring}
                        onChange={e => setForm({ ...form, is_recurring: e.target.checked })} />
                      Conta fixa (repete todo mês)
                    </label>
                    <label className="form-check">
                      <input type="checkbox" checked={form.is_fee}
                        onChange={e => setForm({ ...form, is_fee: e.target.checked })} />
                      É juros/multa
                    </label>
                  </div>
                </div>
              </>
            ) : (
              // RECEITA
              <>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Valor (R$)</label>
                    <input className="form-input" type="number" min="0" step="0.01" value={form.amount}
                      onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="0,00" />
                  </div>
                  {editingId ? (
                    <div className="form-group">
                      <label className="form-label">Mês de início</label>
                      <select className="form-input" value={form.start_month}
                        onChange={e => setForm({ ...form, start_month: e.target.value })}>
                        {MONTHS_NAMES.map((m, i) => <option key={i} value={i}>{m}</option>)}
                      </select>
                    </div>
                  ) : (
                    <div className="form-group">
                      <label className="form-label">Data do 1º recebimento</label>
                      <input className="form-input" type="date" value={form.purchase_date}
                        onChange={e => setForm({ ...form, purchase_date: e.target.value })} />
                    </div>
                  )}
                </div>
                {!editingId && preview && <div className={`form-hint hint-${preview.tone}`}>{preview.text}</div>}
                {editingId ? (
                  <div className="form-row">
                    {!form.is_recurring && (
                      <div className="form-group">
                        <label className="form-label">Duração (meses)</label>
                        <input className="form-input" type="number" min="1" max="360" value={form.total_months}
                          onChange={e => setForm({ ...form, total_months: e.target.value })} />
                      </div>
                    )}
                    <div className="form-group">
                      <label className="form-label">Dia de pagamento</label>
                      <input className="form-input" type="number" min="1" max="31" value={form.pay_day}
                        onChange={e => setForm({ ...form, pay_day: e.target.value })} placeholder="1–31" />
                    </div>
                  </div>
                ) : !form.is_recurring && (
                  <div className="form-group">
                    <label className="form-label">Por quantos meses se repete?</label>
                    <input className="form-input" type="number" min="1" max="360" value={form.total_months}
                      onChange={e => setForm({ ...form, total_months: e.target.value })} />
                  </div>
                )}
                <div className="form-group">
                  <label className="form-check">
                    <input type="checkbox" checked={form.is_recurring}
                      onChange={e => setForm({ ...form, is_recurring: e.target.checked })} />
                    Receita fixa (repete todo mês, ex.: salário)
                  </label>
                </div>
              </>
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
