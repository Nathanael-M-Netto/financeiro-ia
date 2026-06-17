import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { MONTHS_NAMES, CARD_META, HORIZON } from '@/lib/constants' // Make sure constants are correctly exported
import { monthIdxForDate, invoiceSlotForPurchase } from '@/lib/finance-engine'
import { categorize } from '@/lib/categorize'

// Converte 'YYYY-MM-DD' (ou parecido) em Date local; null se inválida.
function parseDateSafe(s) {
  if (!s) return null
  const m = String(s).match(/(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return isNaN(d) ? null : d
}

const GEMINI_MODELS = [
  { id: 'gemini-3.1-flash-lite-preview', label: 'Gemini 3.1 Flash Lite' },
  { id: 'gemini-2.5-flash',              label: 'Gemini 2.5 Flash' },
  { id: 'gemini-3-flash-preview',        label: 'Gemini 3.0 Flash Preview' },
  { id: 'gemini-2.0-flash',              label: 'Gemini 2.0 Flash' },
  { id: 'gemini-flash-latest',           label: 'Gemini Flash Latest' },
]

export async function POST(req) {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { cookies: { getAll: () => cookieStore.getAll() } }
    )
    
    // 1. Auth Validation
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Faça login para usar a IA.' }, { status: 401 })
    }

    const body = await req.json()
    const { userText } = body

    if (!userText || userText.trim().length < 3) {
      return NextResponse.json({ error: 'Texto muito curto.' }, { status: 400 })
    }

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY não configurada no servidor.' }, { status: 500 })
    }

    // 2. Fetch User Data
    const { data: expenses } = await supabase.from('expenses').select('*').eq('user_id', user.id)
    const { data: extraIncome } = await supabase.from('extra_income').select('*').eq('user_id', user.id)
    const { data: cards } = await supabase.from('cards').select('id, key, name, closing_day, due_day').eq('user_id', user.id)

    // Mapa para resolver o card_id a partir da chave/nome que a IA usar.
    const cardIdByKey = {}
    ;(cards || []).forEach(c => {
      if (c.key) cardIdByKey[c.key.toLowerCase()] = c.id
      if (c.name) cardIdByKey[c.name.toLowerCase()] = c.id
    })

    // Build Context
    const dataContext = `
DADOS ATUAIS DA CONTA DO USUÁRIO:
---
RECEITAS:
${extraIncome && extraIncome.length > 0 ? extraIncome.map(i => `- ID: [${i.id}] | Descrição: ${i.description} | R$${i.amount} | Mês Início: ${i.start_month} (${MONTHS_NAMES[i.start_month]}) | Duração: ${i.total_months} meses`).join('\n') : "Nenhuma receita cadastrada."}
---
DESPESAS:
${expenses && expenses.length > 0 ? expenses.map(e => `- ID: [${e.id}] | Descrição: ${e.description} | Cartão: ${e.card} | R$${e.amount} | Mês Início: ${e.start_month} (${MONTHS_NAMES[e.start_month]}) | Parcelas: ${e.total_installments} | Vencimento: Dia ${e.pay_day || 5} | Taxa/Juros: ${e.is_fee}`).join('\n') : "Nenhuma despesa cadastrada."}
---
CARTÕES DO USUÁRIO (use a chave em "cartao"):
${cards && cards.length > 0 ? cards.map(c => `- ${c.name} (chave: ${c.key || c.name.toLowerCase()}) — fecha dia ${c.closing_day ?? '?'}, vence dia ${c.due_day ?? '?'}`).join('\n') : "Nenhum cartão cadastrado ainda."}
---
HOJE é ${new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })} (${new Date().toISOString().slice(0, 10)}).
MESES DE REFERÊNCIA (Índices válidos de 0 a ${HORIZON - 1}):
${MONTHS_NAMES.map((nm, i) => `${i}=${nm}`).join(', ')}
Mês corrente: ${MONTHS_NAMES[monthIdxForDate(new Date())]} (${monthIdxForDate(new Date())})
`;

    const SYSTEM_PROMPT = `Você é um Agente Financeiro Avançado (FinDash AI). Você tem liberdade quase total para ler, organizar, excluir, adicionar e analisar a conta do usuário.

SEU OBJETIVO:
Interagir com o usuário fornecendo relatórios, calculando juros, comparando gastos e realizando ações de banco de dados conforme solicitado.

VOGAL DE COMUNICAÇÃO:
Você deve SEMPRE retornar EXATAMENTE UM JSON ARRAY. Nunca markdown brutão, apenas o JSON.
O Array conterá as AÇÕES que nosso sistema tomará. Por exemplo, sempre envie uma ação de "mensagem" para responder ao usuário, e se necessário, "inserir_despesa", "apagar_despesa", etc.

FORMATO ESTRITO DO JSON:
[
  {
    "acao": "mensagem",
    "texto": "Sua resposta analítica aqui. Pode usar markdown (ex: **negrito**, listas)."
  },
  {
    "acao": "inserir_despesa",
    "descricao": "Mercado",
    "valor": 150.50,
    "cartao": "nubank",
    "parcelas": 1,
    "data_compra": "2026-06-17",
    "is_fee": false
  },
  {
    "acao": "inserir_receita",
    "descricao": "Salário",
    "valor": 2000,
    "data_inicio": "2026-06-05",
    "meses_recorrente": 8
  },
  {
    "acao": "apagar_despesa",
    "id": "uuid-da-despesa-que-o-usuario-pediu-para-apagar"
  },
  {
    "acao": "apagar_receita",
    "id": "uuid-da-receita-que-o-usuario-pediu-para-apagar"
  }
]

REGRAS:
1. Retorne APENAS a string formatada em JSON ARRAY puro (sem comentários).
2. DATAS (muito importante): em despesa use "data_compra" e em receita use "data_inicio", no formato YYYY-MM-DD. NÃO calcule mês de fatura nem dia de vencimento — o sistema calcula isso a partir da data e do cartão. Interprete expressões em relação a HOJE (ex.: "ontem", "dia 5", "semana passada", "mês que vem"). Se a data não for dita, use HOJE.
3. À VISTA — REGRA DE OURO: Pix, dinheiro, débito, OU quando o usuário NÃO citar um cartão de crédito específico → use SEMPRE "cartao": "extra". NUNCA use "fixa" para esses casos. ("fixa" = apenas contas fixas mensais tipo aluguel/internet no cartão "Conta Fixa", não é o padrão!). À vista sai na hora e já fica pago. Ex.: "gastei 50 no mercado" ou "paguei 30 no pix" → "cartao": "extra".
4. Compra no CARTÃO de crédito (só quando o usuário citar o cartão, ex.: "no nubank", "no cartão"): use a chave do cartão e a "data_compra"; o sistema descobre sozinho em qual fatura cai e quando vence. Para uma despesa AGENDADA (futura), use a data futura.
5. Juros/multa: explique na "mensagem"; se o usuário pedir para lançar, crie "inserir_despesa" com is_fee: true.
6. "parcelas" e "meses_recorrente" no mínimo 1. Cartões válidos: "nubank", "will", "havan", "amazon", "mercadopago", "fixa", "extra".

DADOS DE CONTEXTO ESTÃO ANEXADOS AO COMANDO DO USUÁRIO.`;

    // Persiste a mensagem do usuário (histórico do chat).
    const { data: userMessage } = await supabase
      .from('chat_messages')
      .insert({ user_id: user.id, role: 'user', content: userText.trim() })
      .select()
      .single()

    // Busca as últimas mensagens para dar MEMÓRIA de conversa à IA.
    const { data: recent } = await supabase
      .from('chat_messages')
      .select('role, content')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(16)
    const history = (recent || []).reverse()

    // Mensagens marcadas pelo usuário = contexto prioritário para a IA.
    const { data: starred } = await supabase
      .from('chat_messages')
      .select('role, content')
      .eq('user_id', user.id)
      .eq('is_starred', true)
      .order('created_at', { ascending: true })
      .limit(12)
    const starredContext = (starred && starred.length > 0)
      ? `\nMENSAGENS QUE O USUÁRIO MARCOU COMO IMPORTANTES (priorize este contexto):\n${starred.map(s => `- (${s.role === 'assistant' ? 'IA' : 'usuário'}) ${s.content}`).join('\n')}\n`
      : ''

    // Monta o histórico no formato do Gemini (assistant -> model).
    const contents = history.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }))

    // Anexa o contexto financeiro à ÚLTIMA fala do usuário.
    for (let i = contents.length - 1; i >= 0; i--) {
      if (contents[i].role === 'user') {
        contents[i] = { role: 'user', parts: [{ text: `${dataContext}${starredContext}\n\nCOMANDO DO USUÁRIO:\n${contents[i].parts[0].text}` }] }
        break
      }
    }

    let responseText = null
    let modelUsed = ''
    let failedModels = []

    for (const model of GEMINI_MODELS) {
      try {
        responseText = await callModel(apiKey, model.id, SYSTEM_PROMPT, contents)
        modelUsed = model.label
        break // Sucesso
      } catch (err) {
        failedModels.push({ model: model.label, error: err.message })
        console.warn(`[FinDash AI] ${model.label} falhou: ${err.message}`)
      }
    }

    if (!responseText) {
      const errorDetails = failedModels.map(f => `${f.model}: ${f.error}`).join(' | ')
      throw new Error(`Infelizmente nenhum modelo aceitou o comando. (Detalhes: ${errorDetails})`)
    }

    // Limpar markdown da resposta
    const cleanOutput = responseText.replace(/```json/gi, '').replace(/```/g, '').trim()
    let actions = []
    
    try {
      actions = JSON.parse(cleanOutput)
      if (!Array.isArray(actions)) actions = [actions]
    } catch (e) {
      throw new Error('O comando foi recusado ou não foi entendido perfeitamente pela IA. Tente reescrever de forma mais direta.')
    }

    // 3. Execução das Ações de Forma Segura Localizada (apenas para este User ID)
    const exec_results = []
    let aiMessage = ''

    for (const act of actions) {
      if (act.acao === 'mensagem') {
        aiMessage += act.texto + '\n\n'
      }
      else if (act.acao === 'inserir_despesa') {
        const amountVal = parseFloat(act.valor)
        if (isFinite(amountVal) && amountVal > 0) {
          let cardKey = act.cartao || 'extra'
          // Rede de segurança: se o usuário falou em Pix/dinheiro/débito e NÃO citou um
          // cartão de crédito, é à vista ("extra") — mesmo que o modelo tenha errado o cartão.
          const t = (userText || '').toLowerCase()
          const mentionsCash = /\b(pix|dinheiro|d[eé]bito|debito|[aà] vista|avista|esp[eé]cie)\b/.test(t)
          const mentionsCredit = /\b(cart[aã]o|cr[eé]dito|credito|fatura|parcel)/.test(t) ||
            (cards || []).some(c => c.name && t.includes(c.name.toLowerCase()))
          if (mentionsCash && !mentionsCredit) cardKey = 'extra'
          const cardObj = (cards || []).find(c =>
            (c.key || '').toLowerCase() === String(cardKey).toLowerCase() ||
            (c.name || '').toLowerCase() === String(cardKey).toLowerCase()
          )
          const isOnCard = !!cardObj && String(cardKey).toLowerCase() !== 'extra'
          // Prefere a data; só cai nos índices antigos se a IA mandar índice sem data.
          const explicitIdx = act.mes_inicio_idx != null && !act.data_compra
          const pdate = parseDateSafe(act.data_compra) || (explicitIdx ? null : new Date())

          let start_month, pay_day, paidThrough
          if (pdate) {
            if (isOnCard) {
              const slot = invoiceSlotForPurchase(cardObj, pdate)
              start_month = slot.startMonthIdx
              pay_day = slot.payDay
            } else {
              start_month = monthIdxForDate(pdate)
              pay_day = pdate.getDate()
              if (pdate <= new Date()) paidThrough = start_month // à vista hoje/passado = já pago
            }
          } else {
            start_month = Math.min(HORIZON - 1, Math.max(0, parseInt(act.mes_inicio_idx) || 0))
            pay_day = Math.min(31, Math.max(1, parseInt(act.dia_vencimento) || (cardObj && cardObj.due_day) || 5))
          }

          const payload = {
            user_id: user.id,
            description: act.descricao || 'Despesa',
            amount: amountVal,
            start_month,
            total_installments: isOnCard ? Math.min(360, Math.max(1, parseInt(act.parcelas) || 1)) : 1,
            card: cardKey,
            card_id: cardIdByKey[String(cardKey).toLowerCase()] || null,
            category: categorize(act.descricao) || null,
            pay_day,
            is_fee: !!act.is_fee,
            source: 'ai'
          }
          if (paidThrough !== undefined) payload.paid_through = paidThrough
          await supabase.from('expenses').insert(payload)
        }
      }
      else if (act.acao === 'inserir_receita') {
        const amountVal = parseFloat(act.valor)
        if (isFinite(amountVal) && amountVal > 0) {
          const explicitIdx = act.mes_inicio_idx != null && !act.data_inicio
          const pdate = parseDateSafe(act.data_inicio) || (explicitIdx ? null : new Date())
          let start_month, pay_day
          if (pdate) {
            start_month = monthIdxForDate(pdate)
            pay_day = pdate.getDate()
          } else {
            start_month = Math.min(HORIZON - 1, Math.max(0, parseInt(act.mes_inicio_idx) || 0))
            pay_day = Math.min(31, Math.max(1, parseInt(act.dia_pagamento) || 5))
          }
          const payload = {
            user_id: user.id,
            description: act.descricao || 'Receita',
            amount: amountVal,
            start_month,
            total_months: Math.min(360, Math.max(1, parseInt(act.meses_recorrente) || 1)),
            pay_day,
            source: 'ai'
          }
          await supabase.from('extra_income').insert(payload)
        }
      }
      else if (act.acao === 'apagar_despesa' && act.id) {
        await supabase.from('expenses').delete().eq('id', act.id).eq('user_id', user.id)
      }
      else if (act.acao === 'apagar_receita' && act.id) {
        await supabase.from('extra_income').delete().eq('id', act.id).eq('user_id', user.id)
      }
    }

    // Persiste a resposta do assistente (texto que vai pro chat).
    const finalMessage = aiMessage.trim() || 'Pronto! Ações executadas com sucesso.'
    const { data: assistantMessage } = await supabase
      .from('chat_messages')
      .insert({ user_id: user.id, role: 'assistant', content: finalMessage, model: modelUsed })
      .select()
      .single()

    return NextResponse.json({
      success: true,
      modelUsed,
      message: finalMessage,
      userMessage,
      assistantMessage,
    })

  } catch (error) {
    console.error('[FinDash AI Error]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

async function callModel(apiKey, modelId, systemPrompt, contents) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: systemPrompt }]
      },
      contents,
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 4000,
      },
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `HTTP ${res.status}`)
  }

  const data = await res.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Resposta vazia da API do Gemini')
  
  return text
}
