/**
 * Where a row of stock is, in the two senses this app has.
 *
 * A place — Curaçao (NULL) or a warehouse — and a HOLDER: the person carrying
 * it, or nobody, meaning the place itself holds it (migration 112).
 *
 * One helper because every screen that asks "what is standing here" has to
 * answer both halves, and a filter that only checks the place counts Djamy's
 * fifty bottles as Curaçao stock. That is the exact mistake this migration
 * exists to fix, so it must not come back through a screen.
 */
export interface Placed {
  location_id: string | null
  holder_id?: string | null
}

/** Stock the place itself holds — not in anybody's hands. */
export function atPlace(row: Placed, locationId: string | null): boolean {
  return row.location_id === locationId && !row.holder_id
}

/** Stock one person is carrying. */
export function withPerson(row: Placed, holderId: string): boolean {
  return row.holder_id === holderId
}
