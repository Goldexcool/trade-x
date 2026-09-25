import { config } from '../../../config/env.ts'

// The Sales Invoice Pad. Every Trade-X email is a sheet torn from a trader's numbered carbon-copy
// invoice booklet: a white top sheet with the yellow and pink duplicates peeking beneath, a printed
// form in ink, values filled in carbon blue, and red reserved for the pad's official marks
// (numbering-machine serial, rubber stamp). Table layout + inline styles for Gmail/Outlook/Apple Mail.

export const C = {
  field: '#1F2C7A', // the desk the pad sits on: deep carbon-paper blue
  sheet: '#FFFFFF',
  yellow: '#F6E27F', // customer duplicate
  pink: '#F3B8C4', // book copy
  carbon: '#26358C', // every filled-in value
  red: '#C62828', // serial + stamp only
  ink: '#16181D', // the printed form
  muted: '#4A4F5C',
  ruled: '#C9CEDD', // ruled lines on the sheet
  footer: '#C9D0F2', // text on the blue field
}

export const SANS = 'Arial, Helvetica, sans-serif'
export const COND = "'Barlow Condensed', 'Arial Narrow', 'Roboto Condensed', Arial, Helvetica, sans-serif"
export const MONO = "'Courier Prime', 'Courier New', Courier, monospace"

export const esc = (s: unknown) =>
  String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

// ---------- formatting ----------

const naira = new Intl.NumberFormat('en-NG', { maximumFractionDigits: 0 })
/** 2_712_550 kobo → { naira: '27,125', kobo: '50' } — the pad's own ₦ | k columns. */
export const money = (kobo: number) => ({ naira: naira.format(Math.floor(kobo / 100)), kobo: String(kobo % 100).padStart(2, '0') })
export const ngn = (kobo: number) => { const m = money(kobo); return m.kobo === '00' ? `₦${m.naira}` : `₦${m.naira}.${m.kobo}` }

const tz = { timeZone: 'Africa/Lagos' } as const
const dateParts = new Intl.DateTimeFormat('en-US', { ...tz, day: '2-digit', month: 'short', year: 'numeric' })
export const date = (d: string | Date) => {
  const p = Object.fromEntries(dateParts.formatToParts(new Date(d)).map(x => [x.type, x.value]))
  return `${p.day} ${p.month} ${p.year}`
}
export const time = (d: string | Date) => new Date(d).toLocaleTimeString('en-US', { ...tz, hour: 'numeric', minute: '2-digit' })
export const dateTime = (d: string | Date) => `${date(d)}, ${time(d)} WAT`

/** Order reference → the red serial printed by the numbering machine. */
export const serial = (orderId: string) => orderId.replace(/-/g, '').slice(0, 8).toUpperCase()

// ---------- building blocks (all inline-styled tables) ----------

export const stamp = (word: string) => `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border:3px double ${C.red};">
  <tr><td style="padding:7px 12px 6px;font-family:${COND};font-size:17px;line-height:1;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:${C.red};white-space:nowrap;">${esc(word)}</td></tr>
</table>`

// The brand name never splits at its hyphen.
const brand = (html: string) => html.replaceAll('Trade-X', '<span style="white-space:nowrap;">Trade-X</span>')

export const para = (html: string, extra = '') =>
  `<p style="margin:0 0 16px;font-family:${SANS};font-size:16px;line-height:1.55;color:${C.ink};${extra}">${brand(html)}</p>`

export const small = (html: string) =>
  `<p style="margin:0;font-family:${SANS};font-size:13px;line-height:1.5;color:${C.muted};">${brand(html)}</p>`

export const heading = (text: string) =>
  `<h1 class="h1" style="margin:0;font-family:${COND};font-size:32px;line-height:1.1;font-weight:700;color:${C.ink};letter-spacing:0.2px;">${esc(text)}</h1>`

/** Printed label over a dotted rule, value filled in carbon. */
export const fields = (rows: [string, string][]) => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  ${rows.map(([label, value]) => `
  <tr>
    <td class="fl" width="112" valign="bottom" style="padding:10px 10px 4px 0;font-family:${COND};font-size:13px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:${C.ink};white-space:nowrap;">${esc(label)}</td>
    <td class="fv" valign="bottom" style="padding:10px 0 4px;border-bottom:1px dotted ${C.ink};font-family:${MONO};font-size:15px;font-weight:700;color:${C.carbon};word-break:break-all;">${value}</td>
  </tr>`).join('')}
</table>`

export type Line = { name: string; unit_price_kobo: number; quantity: number }

const th = (label: string, align: string, extra = '', cls = '') =>
  `<th scope="col" class="${cls}" align="${align}" style="padding:8px 8px;border-top:2px solid ${C.ink};border-bottom:1px solid ${C.ink};font-family:${COND};font-size:12px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:${C.ink};${extra}">${label}</th>`

/** The pad's ruled Qty | Description | ₦ | k table. */
export function itemsTable(items: Line[], totalKobo: number, totalLabel: string) {
  const v = `font-family:${COND};font-weight:700;color:${C.carbon};`
  const row = (i: Line) => {
    const amount = money(i.unit_price_kobo * i.quantity)
    return `
    <tr>
      <td align="center" valign="top" style="padding:12px 6px;border-bottom:1px solid ${C.ruled};${v}font-size:19px;">${i.quantity}</td>
      <td class="cell" valign="top" style="padding:12px 10px;border-bottom:1px solid ${C.ruled};border-left:1px solid ${C.ink};">
        <div style="${v}font-size:19px;line-height:1.2;">${esc(i.name)}</div>
        <div style="padding-top:3px;font-family:${SANS};font-size:13px;color:${C.muted};white-space:nowrap;">${i.quantity} × ${ngn(i.unit_price_kobo)}</div>
      </td>
      <td class="amt" align="right" valign="top" style="padding:12px 10px;border-bottom:1px solid ${C.ruled};border-left:1px solid ${C.ink};${v}font-size:19px;white-space:nowrap;">${amount.naira}</td>
      <td align="center" valign="top" style="padding:12px 6px;border-bottom:1px solid ${C.ruled};border-left:1px solid ${C.ink};${v}font-size:15px;">${amount.kobo}</td>
    </tr>`
  }
  const t = money(totalKobo)
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
  <tr>${th('Qty', 'center', 'width:36px;')}${th('Description', 'left', `border-left:1px solid ${C.ink};`)}${th('₦', 'right', `width:96px;border-left:1px solid ${C.ink};`, 'amt')}${th('k', 'center', `width:30px;border-left:1px solid ${C.ink};`)}</tr>
  ${items.map(row).join('')}
  <tr>
    <td colspan="2" align="right" style="padding:14px 10px;border-top:2px solid ${C.ink};font-family:${COND};font-size:14px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${C.ink};">${esc(totalLabel)}</td>
    <td class="amt" align="right" style="padding:14px 10px;border-top:2px solid ${C.ink};border-left:1px solid ${C.ink};${v}font-size:22px;white-space:nowrap;">₦${t.naira}</td>
    <td align="center" style="padding:14px 6px;border-top:2px solid ${C.ink};border-left:1px solid ${C.ink};${v}font-size:15px;">${t.kobo}</td>
  </tr>
</table>`
}

/** The amount the reader came for: naira huge, kobo in its own ruled cell, stamp alongside. */
export function amountMass(label: string, kobo: number, stampWord: string) {
  const m = money(kobo)
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td valign="bottom">
      <div style="font-family:${COND};font-size:13px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:${C.ink};padding-bottom:4px;">${esc(label)}</div>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td class="mass" style="font-family:${COND};font-size:56px;line-height:1;font-weight:700;color:${C.carbon};padding-right:10px;white-space:nowrap;">₦${m.naira}</td>
        <td valign="top" style="border-left:1px solid ${C.ink};padding:6px 0 0 10px;font-family:${COND};font-size:22px;line-height:1;font-weight:700;color:${C.carbon};">${m.kobo}</td>
      </tr></table>
    </td>
    <td align="right" valign="bottom" style="padding-bottom:6px;">${stamp(stampWord)}</td>
  </tr>
</table>`
}

export function button(label: string, href: string) {
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:8px;">
  <tr><td bgcolor="${C.carbon}" style="background:${C.carbon};">
    <a href="${esc(href)}" style="display:inline-block;padding:14px 26px;font-family:${COND};font-size:17px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#FFFFFF;text-decoration:none;">${esc(label)}</a>
  </td></tr>
</table>`
}

export const storeButton = (label: string) => (config.appUrl ? button(label, config.appUrl) : '')

export const spacer = (h: number) => `<div style="height:${h}px;line-height:${h}px;font-size:0;">&nbsp;</div>`

// ---------- the sheet ----------

type Sheet = {
  title: string // the form's printed name, e.g. "Receipt"
  preheader: string // inbox preview line
  to: string
  serialNo?: string
  dated: string | Date
  body: string
}

const strip = (color: string, inset: number) => `
<tr><td style="padding:0 ${inset}px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td bgcolor="${color}" height="7" style="height:7px;line-height:7px;font-size:0;background:${color};">&nbsp;</td>
  </tr></table>
</td></tr>`

export function sheet({ title, preheader, to, serialNo, dated, body }: Sheet) {
  return `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${esc(title)} · Trade-X</title>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Courier+Prime:wght@700&display=swap" rel="stylesheet">
<style>
  :root { color-scheme: light only; supported-color-schemes: light only; }
  body { margin: 0; padding: 0; background: ${C.field}; -webkit-text-size-adjust: 100%; }
  a { color: ${C.carbon}; }
  @media (max-width: 620px) {
    .px { padding-left: 20px !important; padding-right: 20px !important; }
    .mass { font-size: 44px !important; }
    .code { font-size: 38px !important; letter-spacing: 8px !important; padding-left: 8px !important; }
    .h1 { font-size: 26px !important; }
    .amt { width: auto !important; padding-left: 6px !important; padding-right: 6px !important; }
    .cell { padding-left: 8px !important; padding-right: 6px !important; }
    .fl, .fv, .stk { display: block !important; width: auto !important; }
    .stk-r { padding: 12px 0 0 !important; text-align: left !important; }
    .fl { padding: 12px 0 2px !important; }
    .fv { padding: 0 0 6px !important; }
  }
</style>
<!--[if mso]><style>table,td,p,div,a,h1{font-family:Arial,sans-serif !important;}</style><![endif]-->
</head>
<body style="margin:0;padding:0;background:${C.field};">
<!--
THESIS: A Trade-X email is a sheet torn from a trader's numbered invoice pad; it refuses the logo-header-card-green-button receipt.
OWN-WORLD: white top sheet over yellow and pink duplicates on carbon-blue; printed form in ink, condensed caps, ruled Qty | Description | ₦ | k columns; values in carbon blue; red only for serial and double-ruled rubber stamp.
STORY: the reader sees the outcome and the amount or code first, then the itemised proof, then exactly what to do.
FIRST VIEWPORT: wordmark and form name left, red serial and date right, heavy double rule, then the mass (code box or naira figure) beside the stamp.
FORM: carbonless sales invoice booklet, candidate 4 of 7, seed e0dd2884.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
-->
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;">${esc(preheader)}${'&#8199;&#847;'.repeat(60)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.field}" style="background:${C.field};">
<tr><td align="center" style="padding:28px 10px 40px;">
  <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">
    <tr><td style="padding:0 2px 12px;font-family:${COND};font-size:13px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:${C.footer};">Customer copy</td></tr>
    <tr><td bgcolor="${C.sheet}" style="background:${C.sheet};">

      <!-- printed header -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td class="px" valign="top" style="padding:26px 0 18px 32px;">
            <div style="font-family:${COND};font-size:30px;line-height:1;font-weight:700;letter-spacing:1px;color:${C.ink};">TRADE-X</div>
            <div style="padding-top:6px;font-family:${COND};font-size:14px;line-height:1;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:${C.ink};">${esc(title)}</div>
          </td>
          <td class="px" align="right" valign="top" style="padding:26px 32px 18px 12px;white-space:nowrap;">
            ${serialNo ? `<div style="font-family:${COND};font-size:13px;font-weight:600;letter-spacing:1.5px;color:${C.ink};">No. <span style="font-family:${MONO};font-size:22px;font-weight:700;letter-spacing:1px;color:${C.red};">${esc(serialNo)}</span></div>` : ''}
            <div style="padding-top:${serialNo ? 6 : 2}px;font-family:${COND};font-size:13px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:${C.ink};">Date <span style="font-family:${MONO};font-size:14px;letter-spacing:0;text-transform:none;color:${C.carbon};">${esc(date(dated))}</span></div>
          </td>
        </tr>
      </table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td height="3" style="height:3px;line-height:3px;font-size:0;border-top:2px solid ${C.ink};border-bottom:1px solid ${C.ink};">&nbsp;</td>
      </tr></table>

      <!-- body -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td class="px" style="padding:28px 32px 32px;">${body}</td></tr>
      </table>

    </td></tr>
    ${strip(C.yellow, 5)}
    ${strip(C.pink, 10)}
    <tr><td style="padding:22px 4px 0;">
      <p style="margin:0 0 6px;font-family:${SANS};font-size:13px;line-height:1.55;color:${C.footer};">Sent to ${esc(to)} because of activity on your <span style="white-space:nowrap;">Trade-X</span> account.</p>
      <p style="margin:0;font-family:${SANS};font-size:13px;line-height:1.55;color:${C.footer};">Questions? Just reply to this email.</p>
    </td></tr>
  </table>
  <!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`
}
