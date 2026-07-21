// Categorias e categorização automática pelo nome (regras por palavra-chave).
// Grátis, instantâneo e offline — cobre a maioria dos casos comuns no Brasil.

export const CATEGORY_META = {
  alimentacao: { name: 'Alimentação', color: '#f5813a' },
  transporte:  { name: 'Transporte', color: '#3ab4f5' },
  moradia:     { name: 'Moradia', color: '#9b6ff7' },
  contas:      { name: 'Contas e serviços', color: '#f5c842' },
  saude:       { name: 'Saúde', color: '#10d49c' },
  lazer:       { name: 'Lazer', color: '#ff4060' },
  assinaturas: { name: 'Assinaturas', color: '#6e45fb' },
  compras:     { name: 'Compras', color: '#4d83ff' },
  educacao:    { name: 'Educação', color: '#1084a4' },
  outros:      { name: 'Outros', color: '#8b909c' },
}

export const CATEGORY_KEYS = Object.keys(CATEGORY_META)

export function normalizeMerchantName(description) {
  return String(description || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(pix|compra|debito|credito|pagamento|pgto|transacao|transf|ted|doc)\b/g, ' ')
    .replace(/\b\d{2,}\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 100)
}

export function importFingerprint({ kind, date, amount, description, externalId, account }) {
  const stableId = String(externalId || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 120)
  const scope = normalizeMerchantName(account || 'conta') || 'conta'
  if (stableId) return `v1|${kind}|${scope}|id:${stableId}`
  const value = Number(amount)
  return `v1|${kind}|${String(date || '')}|${Number.isFinite(value) ? value.toFixed(2) : '0.00'}|${normalizeMerchantName(description)}|${scope}`.slice(0, 300)
}

const RULES = [
  ['alimentacao', ['mercado', 'supermerc', 'padaria', 'pao', 'açougue', 'acougue', 'hortifruti', 'ifood', 'rappi', 'restaurante', 'lanche', 'pizza', 'burger', 'mcdonald', 'feira', 'atacad', 'acai', 'açai', 'cafe', 'café']],
  ['transporte',  ['uber', '99 ', 'cabify', 'posto', 'gasolina', 'combust', 'etanol', 'onibus', 'ônibus', 'metro', 'metrô', 'estacionamento', 'pedagio', 'pedágio', 'mecanic', 'oficina', 'pneu', 'moto', 'passagem']],
  ['moradia',     ['aluguel', 'condominio', 'condomínio', 'iptu', 'reforma', 'movel', 'móvel', 'moveis', 'móveis']],
  ['contas',      ['luz', 'energia', 'agua', 'água', 'internet', 'vivo', 'claro', 'tim', 'telefon', 'gás', 'boleto', 'conta de']],
  ['saude',       ['farmacia', 'farmácia', 'drogaria', 'remedio', 'remédio', 'consulta', 'medic', 'médic', 'dentista', 'exame', 'hospital', 'plano de saude', 'academia', 'psicolog', 'terapia']],
  ['lazer',       ['cinema', 'show', 'balada', 'viagem', 'hotel', 'airbnb', 'jogo', 'game', 'steam', 'parque', 'ingresso', 'festa']],
  ['assinaturas', ['netflix', 'spotify', 'prime', 'disney', 'hbo', 'youtube', 'assinatura', 'icloud', 'google one', 'chatgpt', 'openai', 'claude', 'deezer', 'crunchyroll']],
  ['compras',     ['amazon', 'mercado livre', 'shopee', 'aliexpress', 'magalu', 'americanas', 'roupa', 'loja', 'shopping', 'nike', 'adidas', 'renner', 'riachuelo', 'calçado', 'calcado', 'celular', 'eletronico', 'eletrônico']],
  ['educacao',    ['curso', 'faculdade', 'escola', 'livro', 'udemy', 'alura', 'mensalidade', 'aula']],
]

// Retorna a chave da categoria para uma descrição, ou null se nada casar.
export function categorize(description) {
  const t = normalizeMerchantName(description)
  if (!t) return null
  for (const [cat, words] of RULES) {
    for (const w of words) {
      if (t.includes(w)) return cat
    }
  }
  return null
}

export function categoryMeta(key) {
  return CATEGORY_META[key] || null
}
