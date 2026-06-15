-- ============================================================
-- 0003_categories.sql — Categoria nas despesas
-- ------------------------------------------------------------
-- ▶️  RODE ESTE ARQUIVO no SQL Editor do Supabase. Idempotente.
--
-- Adiciona a coluna `category` em expenses. O app preenche
-- automaticamente pelo nome da despesa (ex.: "iFood" → alimentacao).
-- ============================================================

alter table public.expenses add column if not exists category text;

create index if not exists expenses_category_idx on public.expenses(user_id, category);
