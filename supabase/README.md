# Banco de dados (Supabase)

Schema versionado do FinDash. Cada arquivo em `migrations/` é um passo, em ordem.

## Como aplicar

1. Abra o **SQL Editor** no painel do Supabase.
2. Cole e rode o conteúdo do arquivo de migração indicado.

## Migrações

| Arquivo | O que faz | Rodar agora? |
|---------|-----------|--------------|
| `0000_baseline.sql` | Documenta as tabelas que **já existem** (`expenses`, `extra_income`). Serve para recriar o banco do zero no futuro. | ❌ Não (já existem na sua conta) |
| `0001_cards.sql` | Cria a tabela `cards` (limite, fechamento, vencimento), liga a RLS e migra os cartões de texto para linhas reais. | ✅ Sim |
| `0002_chat.sql` | Cria a tabela `chat_messages` (histórico do chat com a IA + marcar mensagens). | ✅ **Sim** |

> As migrações são idempotentes (dá pra rodar de novo sem quebrar).
