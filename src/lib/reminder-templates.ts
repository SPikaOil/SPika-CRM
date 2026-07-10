// Payment reminder e-mail templates. The texts below are the built-in
// defaults; admins can override them per template in Settings (stored in the
// email_templates table). Placeholders are filled in automatically:
//   {contact}   contact person (falls back to company name)
//   {company}   company name
//   {order}     order number
//   {amount}    outstanding amount incl. currency
//   {due_date}  original due date
//   {days}      days overdue

export type TemplateKey = 'first' | 'second' | 'final'

export interface ReminderTemplate {
  subject: string
  body: string
}

export const TEMPLATE_LABELS: Record<TemplateKey, string> = {
  first: 'First Reminder',
  second: 'Second Reminder',
  final: 'Final Notice',
}

export const TEMPLATE_PLACEHOLDERS =
  '{contact} {company} {order} {amount} {due_date} {days}'

export const DEFAULT_TEMPLATES: Record<TemplateKey, ReminderTemplate> = {
  first: {
    subject: 'Payment Reminder – Order {order}',
    body: `Dear {contact},

We hope this message finds you well.

This is a friendly reminder that payment for order {order} in the amount of {amount} was due on {due_date}.

If you have already arranged payment, please disregard this message. Otherwise, we kindly ask that you process the outstanding balance at your earliest convenience.

Should you have any questions regarding your invoice, please do not hesitate to reach out.

Thank you for your continued business.

Best regards,
SPika Team`,
  },
  second: {
    subject: 'Second Payment Reminder – Order {order} ({days} Days Overdue)',
    body: `Dear {contact},

We are following up on our earlier reminder regarding order {order} for {company}.

The outstanding balance of {amount} was due on {due_date} and is now {days} days overdue. We kindly request that you arrange payment as soon as possible.

If you are experiencing any difficulties, please contact us so we can discuss a suitable payment arrangement.

Best regards,
SPika Team`,
  },
  final: {
    subject: 'FINAL NOTICE – Overdue Payment – Order {order}',
    body: `Dear {contact},

Despite our previous reminders, payment for order {order} ({company}) in the amount of {amount}, which was due on {due_date}, remains outstanding for {days} days.

This is our final notice. If payment is not received within 7 days of this message, we may be required to suspend services and/or refer this matter to a collection agency.

Please contact us immediately to resolve this matter.

SPika Team`,
  },
}

export function fillTemplate(
  tpl: ReminderTemplate,
  vars: Record<string, string>
): ReminderTemplate {
  const fill = (s: string) => s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`)
  return { subject: fill(tpl.subject), body: fill(tpl.body) }
}
