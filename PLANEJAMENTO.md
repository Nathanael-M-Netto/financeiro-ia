# Planejamento — Evolução do FinDash para um app profissional

> Documento de roadmap. Ordem recomendada de execução. Escrito em 15/06/2026.

## Status atual (15/06/2026)

| Fase | Item | Estado |
|------|------|--------|
| 0 | Schema versionado em `supabase/migrations/` | ✅ Feito |
| 1 | Cartão como dado real (tabela `cards`, limite/fechamento/vencimento, tela "Meus Cartões") | ✅ Feito |
| 2 | Análise por cartão (utilização, melhor dia de compra, gráfico mensal, alerta de estouro) | ✅ Feito |
| 4 | IA conversacional: chat com **histórico/memória**, **marcar mensagens**, persistência | ✅ Feito (sem streaming ainda) |
| 0 | Formulário manual de despesa/receita + excluir com confirmação (tela `/lancamentos`) | ✅ Feito |
| 0 | Confirmar antes de apagar **quando a IA deleta** (hoje a IA apaga direto) | ⏳ Pendente |
| 1 | Datas reais / multi-ano (tirar o "Abril–Dez" chumbado) | ⏳ Pendente |
| 1/3 | Categorias + gráficos gerais (Recharts/Tremor) | ⏳ Pendente |
| 5 | Importação de extrato CSV/OFX/PDF | ⏳ Pendente |
| 4 | Trocar JSON-por-prompt por Vercel AI SDK + streaming + tool calling | ⏳ Pendente |
| 6 | TypeScript, testes, biblioteca de UI | ⏳ Pendente |

SQL a aplicar no Supabase: `0001_cards.sql` e `0002_chat.sql`.

## 1. Onde estamos hoje (diagnóstico)

**O que está BOM e deve ser mantido:**
- Infra de segurança: chave do Gemini só no servidor, RLS por `user_id`, sessão SSR por cookie, `auth.getUser()` validado em toda rota.
- Arquitetura Next.js App Router limpa (Server Component busca dados → Client Component renderiza).
- Engine financeira isolada e pura (`finance-engine.js`), fácil de evoluir.

**O que está IMPROVISADO e trava a evolução:**
1. **Tempo chumbado:** o app só projeta 9 meses fixos (Abril→Dezembro) com "mês atual = Abril". Não representa outros meses nem outro ano.
2. **Não há extrato de transações:** só "despesas" (planos de parcelamento) e "receitas". Sem compras individuais, sem categorias, sem datas reais, sem estabelecimento.
3. **Cartão é constante, não dado:** os 7 cartões estão chumbados em `constants.js`, sem limite, sem fechamento, sem vencimento real, e o usuário não pode criar os seus.
4. **IA é "one-shot":** sem histórico, sem follow-up, sem marcar mensagem, sem streaming; o modal descarta a resposta.
5. **IA apaga sem confirmar** e depende de JSON perfeito do Gemini (frágil).
6. **Sem formulário manual:** tudo passa pela IA, sem plano B.
7. **Zero gráficos.**
8. **Schema do banco não está versionado** no repo (só existe dentro do Supabase) — risco de perda.

---

## 2. Visão alvo

Um app de finanças pessoais profissional com:
- Extrato real de **transações** com **categorias** e **datas reais** (multi-mês, multi-ano).
- **Cartões gerenciáveis** pelo usuário, com limite, fechamento e vencimento.
- **Análise por cartão** (utilização do limite, melhor dia de compra, cauda de parcelas, juros, fatia no total).
- **Gráficos** (gasto por categoria, tendência mensal, por cartão, receita × despesa, projeção de saldo).
- **IA conversacional** (chat com histórico, follow-up, marcar/favoritar mensagem, confirmação antes de apagar).
- **Importação de extrato** (CSV/OFX/PDF) — alternativa grátis e legal à conexão automática com banco.

---

## 3. Ordem recomendada (e por quê)

A regra de ouro: **fundação de dados antes de features visuais.** Análise por cartão e
gráficos *dependem* de ter transações, categorias e cartões como dado. Fazer o visual
antes seria construir sobre o mesmo improviso.

| Fase | Entrega | Esforço | Pré-requisito |
|------|---------|---------|---------------|
| **0** | Fundação técnica (schema versionado, validação, form manual, confirmar antes de apagar) | P–M | — |
| **1** | Modelo de dados real (cartões, categorias, transações, datas reais) | M | Fase 0 |
| **2** | Análise por cartão | M | Fase 1 |
| **3** | Gráficos / "mais tipos de dados" | M | Fase 1 |
| **4** | IA conversacional (chat) | M–G | Fase 1 |
| **5** | Importação de extrato (CSV/OFX/PDF) | M | Fase 1 + 4 |
| **6** | Polimento profissional (TypeScript, testes, UI lib) | G | tudo acima |

> Legenda de esforço: **P** = pequeno (1 sessão), **M** = médio (1–2 sessões), **G** = grande (3+ sessões).

---

## 4. Detalhamento por fase

### Fase 0 — Fundação técnica
*Objetivo: tornar o projeto seguro e editável antes de crescer.*

- [ ] Versionar o schema SQL no repo em `supabase/migrations/` (recriar o banco do zero a qualquer momento).
- [ ] Adicionar validação dos payloads da IA (ex.: `zod`) — hoje `parseFloat(undefined)` vira `NaN` sem ninguém perceber.
- [ ] **Formulário manual** de despesa/receita (plano B quando a IA erra).
- [ ] **Confirmação antes de apagar** (modal "tem certeza?") em vez de a IA deletar direto.
- [ ] Corrigir/limpar a lista de modelos Gemini (remover IDs especulativos que podem não existir).

### Fase 1 — Modelo de dados real
*Objetivo: trocar o "0–8 / Abril–Dez" e os cartões chumbados por dados de verdade.*

Tabelas novas (proposta — ver SQL na seção 6):
- `cards` — cartão do usuário: nome, cor, bandeira, **limite**, **dia_fechamento**, **dia_vencimento**, ativo.
- `categories` — categoria: nome, ícone, cor, tipo (despesa/receita). Vem com um conjunto padrão.
- `transactions` — a compra individual: **data real**, valor, descrição, `card_id`, `category_id`, parcela atual/total, tipo.

Mudanças de engine:
- [ ] Trabalhar com **mês/ano reais** (rolar pra frente automaticamente a partir da data de hoje).
- [ ] Manter parcelamento, mas derivado de transações com data real.
- [ ] **Migração** dos dados atuais (`expenses`/`extra_income`) para o novo modelo.

### Fase 2 — Análise por cartão *(a feature que você pediu)*
*Depende da Fase 1, porque precisa de limite e fechamento.*

- [ ] Engine por cartão calculando: total comprometido no mês, **% de utilização do limite**, fatura aberta × fechada (com base no `dia_fechamento`), **melhor dia para comprar** (logo após o fechamento), **cauda de parcelas** (quantos meses ainda deve), juros/multas do cartão, e **fatia no gasto total**.
- [ ] Tela de **detalhe do cartão** com KPIs próprios + um gráfico.
- [ ] Comparativo entre cartões (qual está mais "apertado").

### Fase 3 — Gráficos / mais tipos de dados
- [ ] Adicionar lib de gráficos (`recharts` ou `tremor`).
- [ ] Gráficos: gasto por categoria (pizza/barra), tendência mensal (linha), gasto por cartão, receita × despesa, projeção de saldo futuro.

### Fase 4 — IA conversacional (chat)
*O que mais te incomodou comparando com outros apps.*

- [ ] Tabela `chat_messages` (user_id, role, conteúdo, **favoritada/marcada**, created_at).
- [ ] UI de **chat** com histórico persistente, perguntas de acompanhamento e **marcar/favoritar mensagem**.
- [ ] **Streaming** da resposta (texto aparecendo aos poucos).
- [ ] Trocar "JSON por prompt" por **function calling / saída estruturada** do Gemini (muito mais robusto).
- [ ] **Confirmação** antes de qualquer ação destrutiva.

### Fase 5 — Importação de extrato (substituto grátis da conexão com banco)
*Ver seção 5 para por que essa é a opção viável.*

- [ ] Upload de **CSV/OFX** (o extrato/fatura que você baixa do app do banco) → parser → transações.
- [ ] IA **categoriza automaticamente** as transações importadas.
- [ ] (Opcional) PDF da fatura → IA extrai os itens.

### Fase 6 — Polimento profissional
- [ ] Migrar para **TypeScript**.
- [ ] Biblioteca de UI (`shadcn/ui`) para padronizar e tirar a "cara improvisada".
- [ ] Testes (engine financeira é o alvo mais valioso).
- [ ] Monitoramento de erros; PWA opcional (instalar no celular).

---

## 5. Conexão automática com os apps de cartão — **descartado (não é grátis)**

Você pediu pra considerar puxar os dados sozinho "**se possível e se gratuito, senão nem considere**". Pesquisei e a conclusão é clara: **não é gratuito nem viável para um app pessoal.**

**Por quê:**
- **Open Finance Brasil** é gratuito para o *consumidor*, mas para *consumir* as APIs por software você precisa ser uma **instituição participante regulada** (ou usar um agregador). Não existe acesso direto e gratuito para pessoa física.
- **Agregadores (a ponte comercial):** todos são pagos e exigem CNPJ + habilitação:
  - **Pluggy** ≈ **R$2,5 mil/mês**
  - **Belvo** ≈ **R$6 mil/mês**
  - **Tecnospeed** ≈ R$1,5 mil de entrada + R$540/mês
- **pynubank** (biblioteca não oficial): **quebrada desde agosto/2023**, quando o Nubank passou a exigir verificação facial. Além disso é uso não oficial, com risco de violar os termos do banco e parar de funcionar a qualquer momento. **Não recomendado.**

**Decisão:** não incluir conexão automática. A alternativa **grátis, legal e que entrega ~80% do benefício** é a **Fase 5 — importação de extrato (CSV/OFX/PDF)**: você baixa o extrato no app do banco (1 clique) e o FinDash importa e categoriza com a IA. Sem mensalidade, sem CNPJ, sem risco de termos de uso.

Fontes: [Discussão de custos (TabNews)](https://www.tabnews.com.br/GuilhermeVieira/estou-desenvolvendo-um-app-de-financas-pessoais-e-nao-consigo-pagar-o-open-finance-pluggy-r2-5k-mes-belvo-r6k-mes-tecnospeed-r1-5k-de-entrada-r540) · [Pluggy Open Finance](https://www.pluggy.ai/open-finance) · [Belvo — Agregação Brasil](https://developers.belvo.com/pt-br/products/aggregation_brazil/aggregation-brazil-introduction) · [pynubank](https://github.com/andreroggeri/pynubank) · [Open Finance / BCB](https://www.bcb.gov.br/en/financialstability/open_finance)

---

## 6. Schema novo proposto (rascunho)

> Proposta para a Fase 1. Ainda não aplicado. RLS por `user_id` em todas as tabelas.

```sql
-- Cartões do usuário (substitui o CARD_META chumbado)
create table cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  brand text,                       -- nubank, visa, master...
  color text default '#4d83ff',
  credit_limit numeric(12,2),       -- limite total
  closing_day int,                  -- dia de fechamento da fatura
  due_day int,                      -- dia de vencimento
  is_active boolean default true,
  created_at timestamptz default now()
);

-- Categorias (com um conjunto padrão por usuário)
create table categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  icon text,
  color text,
  kind text not null default 'expense',  -- 'expense' | 'income'
  created_at timestamptz default now()
);

-- Transações reais (o que faltava)
create table transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id uuid references cards(id) on delete set null,
  category_id uuid references categories(id) on delete set null,
  description text not null,
  amount numeric(12,2) not null,
  kind text not null default 'expense',   -- 'expense' | 'income'
  occurred_on date not null,              -- data real
  installment_no int default 1,           -- parcela atual
  installment_total int default 1,        -- total de parcelas
  is_fee boolean default false,           -- juros/multa
  source text default 'manual',           -- 'manual' | 'ai' | 'import'
  created_at timestamptz default now()
);

-- Histórico de chat da IA (Fase 4)
create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null,                     -- 'user' | 'assistant'
  content text not null,
  is_starred boolean default false,       -- mensagem marcada/favoritada
  created_at timestamptz default now()
);
```

---

## 6.1 Referências de mercado (de onde copiar ideia)

Apps e projetos para espelhar, mapeados por fase:

| Referência | Tipo | O que copiar | Fase |
|---|---|---|---|
| **Cleo** | App (IA conversacional) | Pegada de chat que tira dúvida em linguagem natural | 4 |
| **Copilot / Monarch** | Apps | Insights automáticos + categorização + design limpo | 3, 4 |
| **Mobills** (BR) | App | Cartões com limite/utilização e gráficos detalhados | 2, 3 |
| **Organizze** (BR) | App | Interface limpa e entrada rápida | 6 |
| **Actual Budget** | Open-source **React/JS** | Padrões de schema de transações/categorias e UI (stack próxima da nossa) | 1, 3 |
| **Maybe** | Open-source | Referência de produto/UX "finanças aproximáveis" | 6 |
| **Firefly III** | Open-source | Regras de categorização automática e importação | 5 |

Ferramentas que plugam direto na nossa stack (Next.js + Supabase + Gemini):
- **Vercel AI SDK** (`ai` + `@ai-sdk/google`) → chat com streaming + tool calling com Gemini (Fase 4, evolução).
- **Tremor / Recharts** → gráficos profissionais (Fase 3).
- **shadcn/ui** → componentes que tiram a "cara improvisada" (Fase 6).

> Conexão automática com banco/cartão segue **descartada** (ver seção 5): não há opção gratuita.

## 7. Recomendação de início

Começar pela **Fase 0 + Fase 1** juntas (fundação de dados). É o que destrava *tudo* que
você quer — análise por cartão, gráficos e chat — sem retrabalho. Estimativa: 1–2 sessões
de trabalho focado.
