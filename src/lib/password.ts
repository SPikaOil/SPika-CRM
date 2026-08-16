/**
 * One rule for what a password has to look like.
 *
 * It must MATCH the setting in Supabase (Authentication → Sign In / Providers →
 * Email), because that is the wall that actually holds: a customer never sets a
 * password inside this app — they do it on Supabase's own screen via the reset
 * mail. If our form is looser, we wave something through that Supabase then
 * refuses, and the person is left staring at an error nobody warned them about.
 *
 * Set there on 2026-08-16: minimum 12, and "Lowercase, uppercase letters,
 * digits and symbols". Mirrored here so the app says the same thing, and says
 * it BEFORE the save instead of after.
 *
 * Started with Danique's own password turning up on a public breach list.
 */
export const MIN_PASSWORD_LENGTH = 12

/** The symbols Supabase counts. Anything outside this set does not qualify. */
const SYMBOLS = "!@#$%^&*()_+-=[]{};'\\:\"|<>?,./`~"

export const PASSWORD_RULE_TEXT =
  `At least ${MIN_PASSWORD_LENGTH} characters, with a capital, a small letter, a number and a symbol`

/**
 * Returns an error message naming what is MISSING, or null when it passes.
 * Naming the missing piece matters — "password is not strong enough" sends
 * people round in circles guessing which part they got wrong.
 */
export function checkPassword(password: string): string | null {
  if (!password) return 'Enter a password'

  const missing: string[] = []
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`
  }
  if (!/[a-z]/.test(password)) missing.push('a small letter')
  if (!/[A-Z]/.test(password)) missing.push('a capital letter')
  if (!/[0-9]/.test(password)) missing.push('a number')
  if (![...password].some(c => SYMBOLS.includes(c))) missing.push('a symbol (for example ! or #)')

  if (missing.length === 0) return null
  if (missing.length === 1) return `Password still needs ${missing[0]}`
  return `Password still needs ${missing.slice(0, -1).join(', ')} and ${missing[missing.length - 1]}`
}
