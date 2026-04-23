export const MONTHS_NAMES = [
  'Abril', 'Maio', 'Junho', 'Julho',
  'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

export const MONTH_MAP = Object.fromEntries(
  MONTHS_NAMES.map((name, i) => [name.toLowerCase(), i])
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
