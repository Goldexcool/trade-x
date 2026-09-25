import { C, MONO, COND, esc, para, small, sheet, spacer, stamp, time } from './layout.ts'

export type SignupCodeData = { email: string; code: string; expiresAt: string }

export function signupCode(d: SignupCodeData) {
  const until = time(d.expiresAt)
  const body = `
${para('Enter this code to finish creating your Trade-X account.')}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td valign="bottom" style="padding-bottom:8px;font-family:${COND};font-size:13px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:${C.ink};">Your sign-up code</td>
    <td align="right" valign="bottom" style="padding-bottom:8px;">${stamp('One-time use')}</td>
  </tr>
  <tr><td colspan="2" align="center" style="border:2px solid ${C.ink};padding:22px 0;">
    <div class="code" style="font-family:${MONO};font-size:48px;line-height:1;font-weight:700;letter-spacing:14px;padding-left:14px;color:${C.carbon};">${esc(d.code)}</div>
  </td></tr>
  <tr><td colspan="2" style="padding-top:10px;font-family:${MONO};font-size:14px;font-weight:700;color:${C.carbon};">Valid until ${esc(until)} WAT · 10 minutes</td></tr>
</table>
${spacer(26)}
${para('For your security, never share this code. Trade-X will never ask you for it by phone, WhatsApp or text.', 'margin-bottom:12px;')}
${small(`Didn't try to sign up? You can ignore this email. The account can't be used without this code.`)}`

  return {
    subject: `${d.code} is your Trade-X sign-up code`,
    html: sheet({ title: 'Sign-up code', preheader: `Valid for 10 minutes, until ${until} WAT. Don't share it with anyone.`, to: d.email, dated: new Date(), body }),
    text: `TRADE-X · SIGN-UP CODE

Enter this code to finish creating your Trade-X account:

    ${d.code}

Valid until ${until} WAT (10 minutes). It works once.

For your security, never share this code. Trade-X will never ask you for it by phone, WhatsApp or text.

Didn't try to sign up? You can ignore this email. The account can't be used without this code.

Sent to ${d.email}. Questions? Just reply to this email.`,
  }
}
