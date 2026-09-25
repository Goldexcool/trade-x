import { config } from '../../config/env.ts'

export type Message = { to: string; subject: string; html: string; text: string }

/** Sends through Brevo's transactional API. Returns Brevo's messageId. No API key → logs instead (dev/tests). */
export async function sendEmail(m: Message): Promise<string> {
  if (!config.brevoApiKey) {
    console.log(`[email:dev] to=${m.to} subject="${m.subject}"\n${m.text}`)
    return 'dev'
  }
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': config.brevoApiKey, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: config.mailFrom,
      to: [{ email: m.to }],
      replyTo: config.mailFrom,
      subject: m.subject,
      htmlContent: m.html,
      textContent: m.text,
    }),
    signal: AbortSignal.timeout(10_000),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`Brevo ${res.status}: ${body.message ?? body.code ?? 'send failed'}`)
  return body.messageId
}
