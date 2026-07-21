-- ============================================================
-- 0009_merchant_rules_and_chat_replies.sql
-- Categorização que aprende + respostas no chat
-- ------------------------------------------------------------
-- ▶ Rode este arquivo inteiro no SQL Editor do Supabase.
--    É idempotente e não altera lançamentos existentes.
-- ============================================================

create table if not exists public.merchant_category_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  merchant_key text not null,
  display_name text,
  category text not null check (category in (
    'alimentacao', 'transporte', 'moradia', 'contas', 'saude',
    'lazer', 'assinaturas', 'compras', 'educacao', 'outros'
  )),
  source text not null default 'manual' check (source in ('manual', 'search')),
  confidence numeric(4,3) not null default 1 check (confidence >= 0 and confidence <= 1),
  updated_at timestamptz not null default now(),
  unique (user_id, merchant_key)
);

create index if not exists merchant_category_rules_user_idx
  on public.merchant_category_rules(user_id, merchant_key);

alter table public.merchant_category_rules enable row level security;

drop policy if exists "merchant_rules_select_own" on public.merchant_category_rules;
drop policy if exists "merchant_rules_insert_own" on public.merchant_category_rules;
drop policy if exists "merchant_rules_update_own" on public.merchant_category_rules;
drop policy if exists "merchant_rules_delete_own" on public.merchant_category_rules;

create policy "merchant_rules_select_own" on public.merchant_category_rules
  for select using (auth.uid() = user_id);
create policy "merchant_rules_insert_own" on public.merchant_category_rules
  for insert with check (auth.uid() = user_id);
create policy "merchant_rules_update_own" on public.merchant_category_rules
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "merchant_rules_delete_own" on public.merchant_category_rules
  for delete using (auth.uid() = user_id);

alter table public.chat_messages add column if not exists reply_to_id uuid
  references public.chat_messages(id) on delete set null;
alter table public.chat_messages add column if not exists reply_preview text;
alter table public.chat_messages add column if not exists reply_role text
  check (reply_role is null or reply_role in ('user', 'assistant'));

create index if not exists chat_messages_reply_idx
  on public.chat_messages(user_id, reply_to_id)
  where reply_to_id is not null;

-- Identidade estável de transações importadas. Reenviar o mesmo extrato não
-- cria outra linha, mesmo semanas depois ou em outro formato.
alter table public.expenses add column if not exists import_fingerprint text;
alter table public.expenses add column if not exists imported_at timestamptz;
alter table public.extra_income add column if not exists import_fingerprint text;
alter table public.extra_income add column if not exists imported_at timestamptz;

create unique index if not exists expenses_import_fingerprint_unique
  on public.expenses(user_id, import_fingerprint)
  where import_fingerprint is not null;
create unique index if not exists income_import_fingerprint_unique
  on public.extra_income(user_id, import_fingerprint)
  where import_fingerprint is not null;

comment on table public.merchant_category_rules is
  'Memória de categorização por comerciante; evita pesquisar e adivinhar novamente.';
comment on column public.chat_messages.reply_preview is
  'Trecho imutável da mensagem citada, limitado pela aplicação.';
comment on column public.expenses.import_fingerprint is
  'Identidade calculada da transação do extrato para impedir reimportações.';
