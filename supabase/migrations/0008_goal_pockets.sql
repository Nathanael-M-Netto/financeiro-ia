-- ============================================================
-- 0008_goal_pockets.sql — Metas como caixinhas + rendimentos
-- ------------------------------------------------------------
-- ▶ Rode este arquivo inteiro no SQL Editor do Supabase.
--    É idempotente e preserva todas as metas já existentes.
--
-- A meta deixa de ser apenas uma comparação com o saldo geral:
-- passa a ter valor já guardado, aporte mensal, taxa de rendimento
-- e um extrato próprio de aportes, retiradas e rendimentos.
-- ============================================================

alter table public.goals add column if not exists initial_amount numeric(12,2) not null default 0;
alter table public.goals add column if not exists monthly_contribution numeric(12,2) not null default 0;
alter table public.goals add column if not exists monthly_interest_rate numeric(8,5) not null default 0;
alter table public.goals add column if not exists contribution_day int not null default 1;
alter table public.goals add column if not exists target_date date;
alter table public.goals add column if not exists status text not null default 'active';

-- Converte o índice legado da meta para uma data real no último dia do mês.
update public.goals
set target_date = (
  date '2026-04-01' + make_interval(months => target_month) + interval '1 month - 1 day'
)::date
where target_date is null;

create table if not exists public.goal_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid not null references public.goals(id) on delete cascade,
  type text not null check (type in ('contribution', 'withdrawal', 'yield')),
  amount numeric(12,2) not null check (amount > 0),
  occurred_on date not null default current_date,
  note text,
  source text not null default 'manual',
  created_at timestamptz not null default now()
);

create index if not exists goal_transactions_user_date_idx
  on public.goal_transactions(user_id, occurred_on desc);
create index if not exists goal_transactions_goal_date_idx
  on public.goal_transactions(goal_id, occurred_on desc);

alter table public.goal_transactions enable row level security;

drop policy if exists "goal_transactions_select_own" on public.goal_transactions;
drop policy if exists "goal_transactions_insert_own" on public.goal_transactions;
drop policy if exists "goal_transactions_update_own" on public.goal_transactions;
drop policy if exists "goal_transactions_delete_own" on public.goal_transactions;

create policy "goal_transactions_select_own" on public.goal_transactions
  for select using (auth.uid() = user_id);
create policy "goal_transactions_insert_own" on public.goal_transactions
  for insert with check (
    auth.uid() = user_id and exists (
      select 1 from public.goals g where g.id = goal_id and g.user_id = auth.uid()
    )
  );
create policy "goal_transactions_update_own" on public.goal_transactions
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create policy "goal_transactions_delete_own" on public.goal_transactions
  for delete using (auth.uid() = user_id);

comment on column public.goals.initial_amount is
  'Valor que já estava guardado quando a caixinha foi criada; não é despesa.';
comment on column public.goals.monthly_contribution is
  'Aporte planejado por mês; usado na recomendação e projeção.';
comment on column public.goals.monthly_interest_rate is
  'Taxa percentual mensal, por exemplo 0.8 significa 0,8% ao mês.';
comment on table public.goal_transactions is
  'Extrato separado da caixinha. Aportes não entram nas categorias de consumo.';
