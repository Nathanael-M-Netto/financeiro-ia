import { createClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { computeAll, formatCurrency, monthIdxForDate } from '@/lib/finance-engine'
import { monthBaseName, monthYear } from '@/lib/constants'
import { IconClock } from '@/lib/icons'

export default async function HistoricoPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: expenses }, { data: incomes }, { data: cards }] = await Promise.all([
    supabase.from('expenses').select('*').eq('user_id', user.id),
    supabase.from('extra_income').select('*').eq('user_id', user.id),
    supabase.from('cards').select('*').eq('user_id', user.id),
  ])

  const realMonth = monthIdxForDate()
  const metrics = computeAll(expenses || [], incomes || [], new Date(), cards || [])
  const past = metrics.filter(m => m.idx < realMonth).reverse() // mais recente primeiro
  const totalIncome = past.reduce((sum, month) => sum + month.newIncome, 0)
  const totalOut = past.reduce((sum, month) => sum + month.totalOut, 0)
  const averageOut = past.length ? totalOut / past.length : 0
  const lastClosed = past[0]?.balance || 0

  return (
    <div className="page legacy-page history-page anim">
      <header className="app-topbar legacy-topbar">
        <div>
          <h1 className="page-title">Histórico</h1>
          <p className="page-sub">Meses já passados. O painel principal foca sempre no mês atual e nos próximos.</p>
        </div>
      </header>

      {past.length > 0 && (
        <section className="legacy-overview" aria-label="Resumo do histórico">
          <div className="legacy-kpi primary"><span className="legacy-kpi-icon"><IconClock size={18} /></span><div><span>Meses encerrados</span><strong>{past.length}</strong></div></div>
          <div className="legacy-kpi positive"><span>Receitas registradas</span><strong>{formatCurrency(totalIncome)}</strong><small>Sem contar sobras anteriores</small></div>
          <div className="legacy-kpi negative"><span>Média de saídas</span><strong>{formatCurrency(averageOut)}</strong><small>Por mês encerrado</small></div>
          <div className="legacy-kpi"><span>Último saldo fechado</span><strong className={lastClosed >= 0 ? 'pos' : 'neg'}>{formatCurrency(lastClosed)}</strong><small>{monthBaseName(past[0].idx)} de {monthYear(past[0].idx)}</small></div>
        </section>
      )}

      {past.length === 0 ? (
        <div className="empty-state" style={{ margin: '40px 0' }}>
          <div className="empty-state-title">Ainda não há histórico</div>
          <div className="empty-state-desc">Os meses anteriores ao atual aparecem aqui conforme o tempo passa.</div>
        </div>
      ) : (
        <section className="history-ledger card">
          <div className="history-ledger-head"><span>Período</span><span>Entradas</span><span>Saídas</span><span>Saldo final</span></div>
          {past.map(m => {
            const vazio = m.newIncome === 0 && m.totalOut === 0
            return (
              <div key={m.idx} className="history-ledger-row">
                  <div className="hist-month">{monthBaseName(m.idx)} <span className="page-title-year">{monthYear(m.idx)}</span>{vazio && <small>Sem movimento</small>}</div>
                  {vazio ? (
                    <><span>—</span><span>—</span><strong>—</strong></>
                  ) : (
                    <><span className="hist-pos">{formatCurrency(m.newIncome)}</span><span className="hist-neg">{formatCurrency(m.totalOut)}</span><strong style={{ color: m.balance >= 0 ? 'var(--pos)' : 'var(--neg)' }}>{formatCurrency(m.balance)}</strong></>
                  )}
              </div>
            )
          })}
        </section>
      )}
    </div>
  )
}
