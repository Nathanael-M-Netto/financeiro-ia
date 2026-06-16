// Nomes dos 12 meses do ano (Janeiro = 0).
const PT_FULL = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

// A projeção começa em Abril/2026 (índice 0) e cobre 21 meses, indo até
// Dezembro/2027. Assim o app continua funcionando quando o ano virar.
export const BASE_YEAR = 2026;
export const BASE_MONTH = 3; // Abril (Janeiro = 0)
export const HORIZON = 21;   // Abril/2026 … Dezembro/2027

// Data (dia 1) do mês de índice m (0 = Abril/2026).
export function monthDate(m) { return new Date(BASE_YEAR, BASE_MONTH + (m || 0), 1); }

// Só o nome do mês (sem ano). Ex.: 0 → "Abril", 9 → "Janeiro".
export function monthBaseName(m) { return PT_FULL[monthDate(m).getMonth()]; }

// Ano do mês de índice m.
export function monthYear(m) { return monthDate(m).getFullYear(); }

// Nome do mês com o ano só quando for diferente do ano-base (2026).
// Ex.: 2 → "Junho", 9 → "Janeiro 2027".
export function monthName(m) {
  const y = monthYear(m);
  return y === BASE_YEAR ? monthBaseName(m) : `${monthBaseName(m)} ${y}`;
}

// MONTHS_NAMES[m] continua funcionando; agora cobre os 21 meses do horizonte
// (com o ano embutido nos meses de 2027).
export const MONTHS_NAMES = Array.from({ length: HORIZON }, (_, m) => monthName(m));

// Mapa nome→índice apenas dos meses-base de 2026 (Abril..Dezembro = 0..8).
export const MONTH_MAP = Object.fromEntries(
  Array.from({ length: 9 }, (_, i) => [PT_FULL[BASE_MONTH + i].toLowerCase(), i])
);

export const CARD_META = {
  nubank:      { name: 'Nubank',       payDay: 3,  cssVar: '#9b6ff7', tagClass: 'tag-nubank' },
  will:        { name: 'Will Bank',    payDay: 15, cssVar: '#10d49c', tagClass: 'tag-will' },
  havan:       { name: 'Havan',        payDay: 25, cssVar: '#f5813a', tagClass: 'tag-havan' },
  amazon:      { name: 'Amazon',       payDay: 27, cssVar: '#f5c842', tagClass: 'tag-amazon' },
  mercadopago: { name: 'Mercado Pago', payDay: 23, cssVar: '#3ab4f5', tagClass: 'tag-mercadopago' },
  fixa:        { name: 'Conta Fixa',   payDay: 10, cssVar: '#ff4060', tagClass: 'tag-fixa' },
  extra:       { name: 'Extra/Pix',    payDay: 10, cssVar: '#4d83ff', tagClass: 'tag-extra' },
};
