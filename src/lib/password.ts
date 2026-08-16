/**
 * One rule for how long a password has to be.
 *
 * It was 6, typed out separately in three screens and nowhere on the server —
 * so the API would happily create a team member with a three-character
 * password if you called it directly. Six is also how passwords end up on the
 * public breach lists: Danique's own password was flagged on 2026-08-15, which
 * is what started this.
 *
 * Twelve is her call. Existing passwords keep working; the rule bites the next
 * time somebody sets one.
 */
export const MIN_PASSWORD_LENGTH = 12

export const PASSWORD_RULE_TEXT = `At least ${MIN_PASSWORD_LENGTH} characters`

/** Returns an error message, or null when the password is long enough. */
export function checkPassword(password: string): string | null {
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`
  }
  return null
}
