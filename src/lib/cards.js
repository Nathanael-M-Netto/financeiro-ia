import { CARD_META } from './constants'

/**
 * Cartões sugeridos ao usuário (derivados do mapeamento legado CARD_META).
 * Usado quando a conta ainda não tem nenhum cartão cadastrado.
 */
export const DEFAULT_CARDS = Object.entries(CARD_META).map(([key, meta]) => ({
  key,
  name: meta.name,
  color: meta.cssVar,
  due_day: meta.payDay,
}))

/** Converte um hex (#rrggbb ou #rgb) em rgba(). */
export function hexToRgba(hex, alpha = 1) {
  const h = (hex || '#4d83ff').replace('#', '')
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h
  const r = parseInt(full.slice(0, 2), 16) || 0
  const g = parseInt(full.slice(2, 4), 16) || 0
  const b = parseInt(full.slice(4, 6), 16) || 0
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/**
 * Estilo de "chip" para um cartão de cor arbitrária. Cartões criados pelo
 * usuário não têm classe CSS fixa como os 7 legados, então geramos inline.
 */
export function cardChipStyle(color) {
  const c = color || '#4d83ff'
  return {
    background: hexToRgba(c, 0.12),
    color: c,
    border: `1px solid ${hexToRgba(c, 0.25)}`,
  }
}
