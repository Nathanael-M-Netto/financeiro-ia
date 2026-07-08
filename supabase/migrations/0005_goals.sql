-- ============================================================
-- 0005_goals.sql — Metas de economia (passo 4 / "salto")
-- ------------------------------------------------------------
-- ▶️  RODE ESTE ARQUIVO no SQL Editor do Supabase. Idempotente.
--
-- Uma meta = "quero ter R$ X guardado até o mês Y".
-- O app compara o alvo com o saldo projetado e mostra o progresso.
-- ============================================================

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  target_amount numeric(12,2) not null,
  target_month int not null,        -- índice do mês (0 = Abril/2026 ... 20 = Dezembro/2027)
  created_at timestamptz default now()
);

create index if not exists goals_user_idx on public.goals(user_id);

alter table public.goals enable row level security;

drop policy if exists "goals_select_own" on public.goals;
drop policy if exists "goals_insert_own" on public.goals;
drop policy if exists "goals_update_own" on public.goals;
drop policy if exists "goals_delete_own" on public.goals;

create policy "goals_select_own" on public.goals for select using (auth.uid() = user_id);
create policy "goals_insert_own" on public.goals for insert with check (auth.uid() = user_id);
create policy "goals_update_own" on public.goals for update using (auth.uid() = user_id);
create policy "goals_delete_own" on public.goals for delete using (auth.uid() = user_id);
