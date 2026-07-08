-- ============================================================
-- 0007_fixos_e_orcamentos.sql — Receita fixa + Orçamento por categoria
-- ------------------------------------------------------------
-- ▶️  RODE ESTE ARQUIVO no SQL Editor do Supabase. Idempotente.
--
-- 1) `extra_income.is_recurring` — receita FIXA mensal (ex.: salário)
--    que repete todo mês até você tirar, igual à despesa fixa.
-- 2) Tabela `budgets` — teto de gasto mensal por categoria
--    (ex.: "Alimentação até R$ 600/mês"). O app mostra o progresso.
-- ============================================================

alter table public.extra_income add column if not exists is_recurring boolean default false;

comment on column public.extra_income.is_recurring is
  'true = receita fixa mensal (repete até o fim do horizonte, ignora total_months)';

create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null,             -- chave da categoria (alimentacao, transporte, ...)
  monthly_limit numeric(12,2) not null,
  created_at timestamptz default now(),
  unique (user_id, category)
);

create index if not exists budgets_user_idx on public.budgets(user_id);

alter table public.budgets enable row level security;

drop policy if exists "budgets_select_own" on public.budgets;
drop policy if exists "budgets_insert_own" on public.budgets;
drop policy if exists "budgets_update_own" on public.budgets;
drop policy if exists "budgets_delete_own" on public.budgets;

create policy "budgets_select_own" on public.budgets for select using (auth.uid() = user_id);
create policy "budgets_insert_own" on public.budgets for insert with check (auth.uid() = user_id);
create policy "budgets_update_own" on public.budgets for update using (auth.uid() = user_id);
create policy "budgets_delete_own" on public.budgets for delete using (auth.uid() = user_id);
