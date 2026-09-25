import { config } from '../../../config/env.ts'
import { dateTime, esc, fields, heading, itemsTable, ngn, para, serial, sheet, spacer, small, stamp, storeButton, type Line } from './layout.ts'

export type PaymentFailedData = {
  email: string; orderId: string; reference: string; reason: 'failed' | 'expired'; at: string; totalKobo: number; items: Line[]
}

const copy = (d: PaymentFailedData) => d.reason === 'failed'
  ? { head: `Your payment didn't go through`, lead: `Paystack declined the payment for this order, so we've released the items we were holding for you.` }
  : { head: 'Your reservation has ended', lead: `We held your items for ${config.reservationMinutes} minutes, but the payment wasn't completed in time, so we've released them.` }

export function paymentFailed(d: PaymentFailedData) {
  const c = copy(d)
  const body = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
  <td class="stk" valign="middle">${heading(c.head)}</td>
  <td class="stk stk-r" align="right" valign="middle" style="padding-left:12px;">${stamp('Not charged')}</td>
</tr></table>
${spacer(14)}
${para(`${esc(c.lead)} <strong>You have not been charged.</strong>`)}
${para(`If you still want them, add them to your cart again and check out. Prices and stock may have changed since.`)}
${spacer(4)}
${itemsTable(d.items, d.totalKobo, 'Total · not charged')}
${spacer(22)}
${fields([
  ['Order ref', esc(d.reference)],
  ['Released', esc(dateTime(d.at))],
])}
${spacer(24)}
${small(`If money did leave your account for this order, reply to this email with the reference above and we'll sort it out.`)}
${spacer(8)}
${storeButton('Shop again')}`

  return {
    subject: d.reason === 'failed'
      ? `Payment didn't go through for order ${serial(d.orderId)}, you were not charged`
      : `Your Trade-X reservation ended, you were not charged`,
    html: sheet({ title: 'Payment not completed', preheader: `${c.lead} You have not been charged.`, to: d.email, serialNo: serial(d.orderId), dated: d.at, body }),
    text: `TRADE-X · PAYMENT NOT COMPLETED · No. ${serial(d.orderId)}

${c.head}. You have not been charged.

${c.lead}

If you still want them, add them to your cart again and check out. Prices and stock may have changed since.

${d.items.map(i => `${i.quantity} × ${i.name} @ ${ngn(i.unit_price_kobo)} = ${ngn(i.unit_price_kobo * i.quantity)}`).join('\n')}
----------------------------------------
Order total (not charged): ${ngn(d.totalKobo)}

Order ref: ${d.reference}
Released:  ${dateTime(d.at)}

If money did leave your account for this order, reply to this email with the reference above and we'll sort it out.`,
  }
}
