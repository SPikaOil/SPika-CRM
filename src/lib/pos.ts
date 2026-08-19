/**
 * Physical point-of-sale material — the things we put in a box and ship.
 *
 * Kept apart from marketing assets on purpose. An asset is a FILE somebody
 * downloads and its Drive link is mandatory; a POS item is a THING, and a
 * bottle rack has no artwork at all. They meet when a wobbler has a print file,
 * and then the POS item points at the asset.
 *
 * POS is the umbrella term: displays, shelf talkers, wobblers, posters,
 * danglers, price strips. A stand is one kind of display.
 */

export const POS_KINDS = [
  { key: 'display',      label: 'Display',      hint: 'Floor and counter displays, gondolas, our bottle stands' },
  { key: 'shelf_talker', label: 'Shelf talker', hint: 'Fixed card on the shelf edge' },
  { key: 'wobbler',      label: 'Wobbler',      hint: 'The moving one — catches the eye where a talker does not' },
  { key: 'poster',       label: 'Poster',       hint: 'On the wall or the window' },
  { key: 'dangler',      label: 'Dangler',      hint: 'Hangs from the ceiling, seen from a distance' },
  { key: 'other',        label: 'Other',        hint: 'Anything else we hand over' },
] as const

export type PosKind = (typeof POS_KINDS)[number]['key']

export function posKindLabel(key: string | null | undefined): string {
  return POS_KINDS.find(k => k.key === key)?.label ?? 'Other'
}

/**
 * A €0 line for the order and for the delivery run.
 *
 * The sku comes from the CATALOGUE, not from the name. Until now it was derived
 * from an asset title, which meant rewording an item quietly produced a
 * different sku on the next order and the two could never be counted together.
 */
export function posOrderLineFor(item: { sku?: string | null; name: string }, qty: number) {
  return {
    sku: item.sku ? `pos-${item.sku}` : `pos-${slugForSku(item.name)}`,
    name: `${item.name} (POS material)`,
    qty,
    unit_price: 0,
    discount: 0,
    line_total: 0,
  }
}

/** True for a line this app put on an order as POS material rather than goods. */
export function isPosLine(line: { sku?: string | null }): boolean {
  return (line.sku ?? '').startsWith('pos-')
}

function slugForSku(title: string) {
  return title
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '').slice(0, 40)
}
