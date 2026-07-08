-- ============================================================
-- 0006_recorrente.sql — Despesa FIXA mensal (sem fim)
-- ------------------------------------------------------------
-- ▶️  RODE ESTE ARQUIVO no SQL Editor do Supabase. Idempotente.
--
-- `is_recurring = true` → a despesa repete TODO mês, do mês de
-- início até o fim do horizonte (aluguel, internet, assinatura),
-- sem precisar dizer "em quantas vezes". Continua existindo o
-- parcelado normal (total_installments) para compras em Nx.
-- ============================================================

alter table public.expenses add column if not exists is_recurring boolean default false;

comment on column public.expenses.is_recurring is
  'true = conta fixa mensal (repete até o fim do horizonte, ignora total_installments)';
