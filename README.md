# FinDash — Controle Financeiro com IA

Dashboard financeiro pessoal full-stack com assistente inteligente Gemini.

## Stack

- **Frontend:** Next.js 16, React 19, CSS puro
- **Backend:** Next.js API Routes (Edge), Supabase Auth + PostgreSQL
- **IA:** Google Gemini (fallback dinâmico entre modelos)
- **Deploy:** Vercel / qualquer provedor Node.js

## Funcionalidades

- Autenticação completa (login/cadastro com nome)
- Dashboard financeiro com projeção mensal (Abril–Dezembro)
- Indicação automática de cartões, parcelas e saldos
- Alertas dinâmicos de atrasos e encargos
- Adição de lançamentos por linguagem natural via Gemini
- Row Level Security — cada usuário vê apenas seus dados
- Chave da API Gemini blindada no servidor

## Configuração

1. Crie um projeto no [Supabase](https://supabase.com)
2. Execute o schema SQL no SQL Editor do Supabase
3. Copie URL e Anon Key para `.env.local`
4. `npm install && npm run dev`

## Variáveis de Ambiente

```env
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua_chave_anon
GEMINI_API_KEY=sua_chave_gemini
```

## Licença

Projeto pessoal de portfólio.
