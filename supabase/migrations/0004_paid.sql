-- ============================================================
-- 0004_paid.sql — Status de "pago" nas despesas
-- ------------------------------------------------------------
-- ▶️  RODE ESTE ARQUIVO no SQL Editor do Supabase. Idempotente.
--
-- `paid_through` = maior índice de mês já PAGO de uma despesa
-- (0=Abril, 1=Maio, ... 8=Dezembro). NULL = nada pago.
-- Uma parcela do mês `m` é considerada paga quando m <= paid_through.
-- Com isso o app calcula a "sobra real = saldo − contas não pagas"
-- e tira do "falta pagar"/encargos o que já foi quitado.
-- ============================================================

alter table public.expenses add column if not exists paid_through int;

comment on column public.expenses.paid_through is
  'Maior índice de mês já pago (0=Abril..8=Dezembro). NULL = nada pago.';
