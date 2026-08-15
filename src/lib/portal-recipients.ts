import { createAdminClient } from '@/lib/supabase/admin'

/**
 * The only addresses this app may ever write to for a customer.
 *
 * Danique, 2026-08-15:
 *   "als een klant in de portal een ander email adres heeft dan in onze
 *    customers tab, dan MOET HET ALTIJD ENKEL DE INFO PAKKEN VAN DE B2B PORTAL
 *    OPZET van desbetreffende klant... zorg dat de app geen eigen interpretatie
 *    kan doen omdat ie op 2 plekken email adressen ziet staan."
 *
 * There are indeed two places an address can be found, and they mean completely
 * different things:
 *
 *   customers.email / billing_emails  — OUR notes. Somebody typed them so we can
 *                                       look them up. Nobody agreed to be mailed.
 *   users.email (role customer)       — the login the customer created and uses
 *                                       themselves. That is a mailbox they own.
 *
 * Only the second is a recipient. The first is never read here, and the caller
 * cannot pass an address in either: it is resolved server-side from the customer
 * id, so no screen can hand the app "an e-mail address" and have it believe it.
 *
 * No portal login means no recipients means nothing is sent. That is the point,
 * not an edge case: a customer who never signed up never asked to hear from us.
 */
export async function portalRecipients(customerId: string | null | undefined): Promise<string[]> {
  if (!customerId) return []

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('users')
    .select('email, is_active')
    .eq('customer_id', customerId)
    .eq('role', 'customer')

  if (error) {
    // Never guess. A lookup that failed is not "send it to the address on the
    // customer card instead" — it is send nothing.
    console.error('[portal-recipients] lookup failed:', error.message)
    return []
  }

  return (data ?? [])
    .filter(u => u.is_active !== false && !!u.email)
    .map(u => u.email as string)
}
