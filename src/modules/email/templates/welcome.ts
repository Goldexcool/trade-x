import { config } from '../../../config/env.ts'
import { C, COND, SANS, esc, heading, para, sheet, spacer, stamp, storeButton } from './layout.ts'

export type WelcomeData = { email: string }

const steps = (): [string, string][] => [
  ['Check out', `We hold your items for ${config.reservationMinutes} minutes while you pay, so nobody else can buy them in the meantime.`],
  ['Pay with Paystack', 'Card, bank transfer or USSD. We confirm every payment with Paystack directly, not just your browser.'],
  ['Get your receipt', 'An itemised receipt lands in this inbox the moment your payment is confirmed.'],
]

export function welcome(d: WelcomeData) {
  const rows = steps().map(([label, text], i) => `
  <tr>
    <td width="30" valign="top" style="padding:14px 0;border-bottom:1px solid ${C.ruled};font-family:${COND};font-size:19px;font-weight:700;color:${C.carbon};">${i + 1}</td>
    <td valign="top" style="padding:14px 0 14px 12px;border-bottom:1px solid ${C.ruled};border-left:1px solid ${C.ink};">
      <div style="font-family:${COND};font-size:19px;line-height:1.2;font-weight:700;color:${C.carbon};">${esc(label)}</div>
      <div style="padding-top:4px;font-family:${SANS};font-size:15px;line-height:1.5;color:${C.ink};">${esc(text)}</div>
    </td>
  </tr>`).join('')

  const body = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
  <td class="stk" valign="middle">${heading('Your account is ready')}</td>
  <td class="stk stk-r" align="right" valign="middle" style="padding-left:12px;">${stamp('Verified')}</td>
</tr></table>
${spacer(14)}
${para(`Welcome to Trade-X. Your email address is confirmed, so you can sign in and start shopping.`)}
${spacer(4)}
<div style="padding-bottom:8px;font-family:${COND};font-size:13px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:${C.ink};">How buying works</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border-top:2px solid ${C.ink};">${rows}
</table>
${spacer(24)}
${storeButton('Start shopping')}`

  return {
    subject: 'Welcome to Trade-X, your account is ready',
    html: sheet({ title: 'Welcome', preheader: 'Your email is confirmed. Here is how buying on Trade-X works.', to: d.email, dated: new Date(), body }),
    text: `TRADE-X · WELCOME

Your account is ready.

Welcome to Trade-X. Your email address is confirmed, so you can sign in and start shopping.

How buying works:
${steps().map(([l, t], i) => `${i + 1}. ${l}: ${t}`).join('\n')}
${config.appUrl ? `\nStart shopping: ${config.appUrl}\n` : ''}
Sent to ${d.email}. Questions? Just reply to this email.`,
  }
}
