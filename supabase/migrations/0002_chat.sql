-- ============================================================
-- 0002_chat.sql — Histórico do chat com a IA (Fase 4)
-- ------------------------------------------------------------
-- ▶️  RODE ESTE ARQUIVO INTEIRO no SQL Editor do Supabase.
--     É idempotente (pode rodar de novo sem quebrar).
--
-- Guarda a conversa do usuário com o assistente, permitindo
-- histórico contínuo (memória) e marcar mensagens (favoritar).
-- ============================================================

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  is_starred boolean default false,   -- mensagem marcada/favoritada
  model text,                         -- qual modelo respondeu (info)
  created_at timestamptz default now()
);

create index if not exists chat_messages_user_idx on public.chat_messages(user_id, created_at);

alter table public.chat_messages enable row level security;

drop policy if exists "chat_select_own" on public.chat_messages;
drop policy if exists "chat_insert_own" on public.chat_messages;
drop policy if exists "chat_update_own" on public.chat_messages;
drop policy if exists "chat_delete_own" on public.chat_messages;

create policy "chat_select_own" on public.chat_messages for select using (auth.uid() = user_id);
create policy "chat_insert_own" on public.chat_messages for insert with check (auth.uid() = user_id);
create policy "chat_update_own" on public.chat_messages for update using (auth.uid() = user_id);
create policy "chat_delete_own" on public.chat_messages for delete using (auth.uid() = user_id);
