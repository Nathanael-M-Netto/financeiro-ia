-- ============================================================
-- 0000_baseline.sql — DOCUMENTAÇÃO do schema que JÁ existe
-- ------------------------------------------------------------
-- Este arquivo só DOCUMENTA as tabelas que o app já usa hoje
-- (expenses e extra_income), para o repositório conseguir
-- recriar o banco do zero no futuro.
--
-- ⚠️  NÃO precisa rodar isto no Supabase agora — essas tabelas
--     já existem na sua conta. Rode apenas o 0001_cards.sql.
-- ============================================================

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  description text,
  card text,
  amount numeric(12,2),
  start_month int,            -- 0 = Abril ... 8 = Dezembro (modelo legado)
  total_installments int default 1,
  installment_offset int default 1,
  is_fee boolean default false,
  source text default 'manual',
  pay_day int,
  created_at timestamptz default now()
);

create table if not exists public.extra_income (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  description text,
  amount numeric(12,2),
  start_month int,
  total_months int default 1,
  pay_day int,
  source text default 'manual',
  created_at timestamptz default now()
);

-- RLS (reconstrução do que o app pressupõe: cada usuário vê só o seu)
alter table public.expenses     enable row level security;
alter table public.extra_income enable row level security;

-- (políticas equivalentes às que já devem existir na sua conta)
-- expenses
--   select/insert/update/delete  using (auth.uid() = user_id)
-- extra_income
--   select/insert/update/delete  using (auth.uid() = user_id)
