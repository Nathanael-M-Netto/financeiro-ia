import { createClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { computeAll, formatCurrency, monthIdxForDate } from '@/lib/finance-engine'

export default async function HistoricoPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: expenses }, { data: incomes }] = await Promise.all([
    supabase.from('expenses').select('*').eq('user_id', user.id),
    supabase.from('extra_income').select('*').eq('user_id', user.id),
  ])

  const realMonth = monthIdxForDate()
  const metrics = computeAll(expenses || [], incomes || [], new Date())
  const past = metrics.filter(m => m.idx < realMonth).reverse() // mais recente primeiro

  return (
    <div className="cards-page">
      <header className="app-topbar">
        <div>
          <h1 className="page-title">Histórico</h1>
          <p className="page-sub">Meses já passados. O painel principal foca sempre no mês atual e nos próximos.</p>
        </div>
      </header>

      {past.length === 0 ? (
        <div className="empty-state" style={{ margin: '40px 0' }}>
          <div className="empty-state-title">Ainda não há histórico</div>
          <div className="empty-state-desc">Os meses anteriores ao atual aparecem aqui conforme o tempo passa.</div>
        </div>
      ) : (
        <div className="hist-grid">
          {past.map(m => {
            const vazio = m.totalIn === 0 && m.totalOut === 0
            return (
              <div key={m.idx} className="card hist-card">
                <div className="card-body">
                  <div className="hist-month">{m.monthName} <span className="page-title-year">2026</span></div>
                  {vazio ? (
                    <div className="hist-empty">Sem movimento</div>
                  ) : (
                    <div className="hist-rows">
                      <div className="hist-row"><span>Entradas</span><strong className="hist-pos">{formatCurrency(m.totalIn)}</strong></div>
                      <div className="hist-row"><span>Saídas</span><strong className="hist-neg">{formatCurrency(m.totalOut)}</strong></div>
                      <div className="hist-row hist-bal"><span>Saldo</span><strong style={{ color: m.balance >= 0 ? 'var(--pos)' : 'var(--neg)' }}>{formatCurrency(m.balance)}</strong></div>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
