import 'server-only'

import { CATEGORY_KEYS, categorize, normalizeMerchantName } from './categorize'

const MIN_SEARCH_CONFIDENCE = 0.72
const SEARCH_MODEL = 'gemini-2.5-flash'

function safeJson(text) {
  const clean = String(text || '').replace(/```json/gi, '').replace(/```/g, '').trim()
  try {
    const parsed = JSON.parse(clean)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    const start = clean.indexOf('[')
    const end = clean.lastIndexOf(']')
    if (start < 0 || end <= start) return []
    try { return JSON.parse(clean.slice(start, end + 1)) } catch { return [] }
  }
}

async function researchUnknownMerchants(apiKey, unknown) {
  if (!apiKey || unknown.length === 0) return new Map()
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${SEARCH_MODEL}:generateContent`
  const merchants = unknown.slice(0, 60).map(item => ({ key: item.key, name: item.description }))
  const prompt = `Pesquise na web o que são os comerciantes brasileiros abaixo e classifique cada um.

Categorias permitidas, sem criar outras:
alimentacao, transporte, moradia, contas, saude, lazer, assinaturas, compras, educacao, outros.

Regras:
- Use alimentacao para supermercado, restaurante, padaria e bebidas.
- Use compras para varejo de roupas, eletrônicos e lojas generalistas.
- Se o nome for ambíguo, a busca não identificar claramente a atividade ou as fontes forem fracas, use outros.
- Não conclua a categoria apenas por uma palavra vaga no nome.
- Retorne SOMENTE um JSON array. Cada item deve ter exatamente:
  {"key":"chave recebida","category":"categoria permitida","confidence":0.0,"found":true}
- confidence representa a confiança baseada no que a pesquisa realmente encontrou.

Comerciantes:
${JSON.stringify(merchants)}`

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      tools: [{ google_search: {} }],
      generationConfig: { temperature: 0, maxOutputTokens: 3000 },
    }),
  })
  if (!response.ok) throw new Error(`Pesquisa de comerciantes indisponível (HTTP ${response.status}).`)
  const data = await response.json()
  const output = data.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('') || ''
  const researched = new Map()
  for (const item of safeJson(output)) {
    const key = String(item?.key || '')
    const category = String(item?.category || '').toLowerCase()
    const confidence = Math.max(0, Math.min(1, Number(item?.confidence) || 0))
    if (!merchants.some(merchant => merchant.key === key)) continue
    researched.set(key, {
      category: item?.found && CATEGORY_KEYS.includes(category) && confidence >= MIN_SEARCH_CONFIDENCE ? category : 'outros',
      confidence,
      source: item?.found && confidence >= MIN_SEARCH_CONFIDENCE ? 'search' : 'fallback',
    })
  }
  return researched
}

export async function classifyMerchantDescriptions({ apiKey, descriptions, cachedRules = [], allowSearch = true }) {
  const cache = new Map((cachedRules || []).map(rule => [String(rule.merchant_key), rule]))
  const unique = new Map()
  for (const description of descriptions || []) {
    const value = String(description || '').trim()
    const key = normalizeMerchantName(value)
    if (key && !unique.has(key)) unique.set(key, { key, description: value })
  }

  const result = new Map()
  const unknown = []
  for (const item of unique.values()) {
    const local = categorize(item.description)
    if (local) {
      result.set(item.key, { category: local, confidence: 1, source: 'local' })
      continue
    }
    const saved = cache.get(item.key)
    if (saved && CATEGORY_KEYS.includes(saved.category)) {
      result.set(item.key, { category: saved.category, confidence: Number(saved.confidence) || 1, source: 'saved' })
      continue
    }
    unknown.push(item)
  }

  let researched = new Map()
  if (allowSearch && unknown.length) {
    try { researched = await researchUnknownMerchants(apiKey, unknown) } catch { /* fallback seguro abaixo */ }
  }
  for (const item of unknown) {
    result.set(item.key, researched.get(item.key) || { category: 'outros', confidence: 0, source: 'fallback' })
  }
  return result
}

export function categoryForDescription(classifications, description) {
  return classifications.get(normalizeMerchantName(description)) || { category: 'outros', confidence: 0, source: 'fallback' }
}
