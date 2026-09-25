import { amountMass, dateTime, esc, fields, itemsTable, ngn, para, serial, sheet, spacer, small, storeButton, type Line } from './layout.ts'

export type OrderPaidData = { email: string; orderId: string; reference: string; paidAt: string; totalKobo: number; items: Line[] }

export function orderPaid(d: OrderPaidData) {
  const body = `
${amountMass('Amount paid', d.totalKobo, 'Paid')}
${spacer(22)}
${para(`Thank you. We've received your payment and your order is confirmed. Keep this email as your receipt.`)}
${spacer(4)}
${itemsTable(d.items, d.totalKobo, 'Total paid')}
${spacer(22)}
${fields([
  ['Billed to', esc(d.email)],
  ['Paid on', esc(dateTime(d.paidAt))],
  ['Paystack ref', esc(d.reference)],
])}
${spacer(24)}
${small('Prices shown are what you were charged at checkout. Later price changes in the store never affect this order.')}
${spacer(8)}
${storeButton('Back to the store')}`

  return {
    subject: `Receipt for your Trade-X order ${serial(d.orderId)} · ${ngn(d.totalKobo)}`,
    html: sheet({ title: 'Receipt', preheader: `Payment of ${ngn(d.totalKobo)} confirmed. Your order is confirmed.`, to: d.email, serialNo: serial(d.orderId), dated: d.paidAt, body }),
    text: `TRADE-X · RECEIPT No. ${serial(d.orderId)}

PAID: ${ngn(d.totalKobo)}

Thank you. We've received your payment and your order is confirmed. Keep this email as your receipt.

${d.items.map(i => `${i.quantity} × ${i.name} @ ${ngn(i.unit_price_kobo)} = ${ngn(i.unit_price_kobo * i.quantity)}`).join('\n')}
----------------------------------------
Total paid: ${ngn(d.totalKobo)}

Billed to:    ${d.email}
Paid on:      ${dateTime(d.paidAt)}
Paystack ref: ${d.reference}

Questions? Just reply to this email.`,
  }
}
