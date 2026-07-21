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
| `0003_categories.sql` | Adiciona categorias às despesas. | ✅ Sim |
| `0004_paid.sql` | Adiciona o controle mensal de pago/pendente. | ✅ Sim |
| `0005_goals.sql` | Cria as metas de economia. | ✅ Sim |
| `0006_recorrente.sql` | Adiciona despesas fixas recorrentes. | ✅ Sim |
| `0007_fixos_e_orcamentos.sql` | Adiciona receitas fixas e orçamentos mensais. | ✅ Sim |
| `0008_goal_pockets.sql` | Evolui metas para caixinhas com aportes, retiradas, rendimento e RLS. | ✅ Sim |
| `0009_merchant_rules_and_chat_replies.sql` | Memoriza categorias por comerciante e permite responder mensagens específicas no chat. | ✅ **Sim — nova** |

> As migrações são idempotentes (dá pra rodar de novo sem quebrar).
