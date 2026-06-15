-- ============================================================
-- 0001_cards.sql — Cartões como dado real (Fase 1, parte 1)
-- ------------------------------------------------------------
-- ▶️  RODE ESTE ARQUIVO INTEIRO no SQL Editor do Supabase.
--     É idempotente: pode rodar mais de uma vez sem quebrar.
--
-- O que ele faz:
--   1) cria a tabela `cards` (cartão do usuário, com limite,
--      fechamento e vencimento)
--   2) liga a RLS (cada usuário só vê os seus cartões)
--   3) migra os cartões "de texto" que já existem em
--      expenses.card para linhas reais em `cards`
--   4) cria expenses.card_id apontando para o cartão certo
-- ============================================================

-- 1) Tabela de cartões do usuário
create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  key text,                       -- chave legada (nubank, will...) p/ casar com expenses.card
  name text not null,
  brand text,
  color text default '#4d83ff',
  credit_limit numeric(12,2),     -- limite total do cartão
  closing_day int,                -- dia de FECHAMENTO da fatura
  due_day int,                    -- dia de VENCIMENTO
  is_active boolean default true,
  created_at timestamptz default now()
);

create index if not exists cards_user_id_idx on public.cards(user_id);

-- 2) RLS: cada usuário só enxerga/edita seus cartões
alter table public.cards enable row level security;

drop policy if exists "cards_select_own" on public.cards;
drop policy if exists "cards_insert_own" on public.cards;
drop policy if exists "cards_update_own" on public.cards;
drop policy if exists "cards_delete_own" on public.cards;

create policy "cards_select_own" on public.cards for select using (auth.uid() = user_id);
create policy "cards_insert_own" on public.cards for insert with check (auth.uid() = user_id);
create policy "cards_update_own" on public.cards for update using (auth.uid() = user_id);
create policy "cards_delete_own" on public.cards for delete using (auth.uid() = user_id);

-- 3) Migra os cartões "de texto" existentes (expenses.card) para a tabela cards.
--    Puxa nome/cor/vencimento do mapeamento legado do app (CARD_META).
insert into public.cards (user_id, key, name, color, due_day)
select distinct e.user_id, e.card,
  case e.card
    when 'nubank'      then 'Nubank'
    when 'will'        then 'Will Bank'
    when 'havan'       then 'Havan'
    when 'amazon'      then 'Amazon'
    when 'mercadopago' then 'Mercado Pago'
    when 'fixa'        then 'Conta Fixa'
    when 'extra'       then 'Extra/Pix'
    else initcap(e.card)
  end as name,
  case e.card
    when 'nubank'      then '#9b6ff7'
    when 'will'        then '#10d49c'
    when 'havan'       then '#f5813a'
    when 'amazon'      then '#f5c842'
    when 'mercadopago' then '#3ab4f5'
    when 'fixa'        then '#ff4060'
    when 'extra'       then '#4d83ff'
    else '#4d83ff'
  end as color,
  case e.card
    when 'nubank'      then 3
    when 'will'        then 15
    when 'havan'       then 25
    when 'amazon'      then 27
    when 'mercadopago' then 23
    when 'fixa'        then 10
    when 'extra'       then 10
    else 10
  end as due_day
from public.expenses e
where e.card is not null and e.card <> ''
  and not exists (
    select 1 from public.cards c
    where c.user_id = e.user_id and c.key = e.card
  );

-- 4) Liga as despesas existentes ao cartão (FK). Mantém a coluna `card` (texto)
--    por compatibilidade — nada é apagado.
alter table public.expenses add column if not exists card_id uuid references public.cards(id) on delete set null;

update public.expenses e
set card_id = c.id
from public.cards c
where c.user_id = e.user_id and c.key = e.card and e.card_id is null;
