# Trade-X email design

The visual system for Trade-X transactional email. The architecture and engineering scenarios live in [DESIGN.md](DESIGN.md); product context is in [PRODUCT.md](PRODUCT.md). The code is in `src/modules/email/templates/`, and every value below comes from `layout.ts`.

## World: the sales invoice pad

Every email is a sheet torn from a Nigerian trader's numbered carbon-copy invoice booklet: the "Cash Sales Invoice" pads used across Balogun and Computer Village.

- The printed form is in ink.
- Everything filled in is carbon blue.
- The numbering-machine serial and the rubber stamp are the only red.

This reads as official and countable, which is the feeling a receipt should give. It deliberately avoids the logo, white card and green button receipt that every shop sends.

## Palette

| Token | Hex | Role |
|---|---|---|
| `field` | `#1F2C7A` | Deep carbon-paper blue. The desk the pad lies on; the email background. |
| `sheet` | `#FFFFFF` | The top sheet. |
| `yellow` | `#F6E27F` | Customer duplicate, peeking 7px below the sheet. |
| `pink` | `#F3B8C4` | Book copy, peeking below the yellow. |
| `carbon` | `#26358C` | Every filled-in value: amounts, names, codes, dates, the button. |
| `ink` | `#16181D` | The printed form: labels, rules, headings, body copy. |
| `red` | `#C62828` | **Only** the serial number and the stamp. One official red mark per email, never used in UI or copy. |
| `muted` | `#4A4F5C` | Secondary copy on the sheet (about 8:1 on white). |
| `ruled` | `#C9CEDD` | Light ruled lines between table rows. |
| `footer` | `#C9D0F2` | Text on the blue field (about 9:1). |

Colour strategy: **Committed.** The carbon-blue field owns the frame, and the white sheet holds all the content.

## Type

| Role | Stack | Use |
|---|---|---|
| Printed form | `'Barlow Condensed', 'Arial Narrow', 'Roboto Condensed', Arial` | Wordmark (30px), form name and labels (13–14px caps, tracked 1.5–3px), headings (32px, 26px on phones), filled values (19px bold), and the amount (56px, 44px on phones) |
| Numbering machine | `'Courier Prime', 'Courier New', Courier` | Serial number, sign-up code (48px, tracked 14px), references, dates in fields |
| Body copy | `Arial, Helvetica` | Sentences at 16px/1.55; small print at 13px |

Barlow Condensed and Courier Prime load from Google Fonts where a mail client allows web fonts (Apple Mail, iOS, Samsung). Gmail and Outlook fall back to Arial Narrow and Courier New, which keep the same character. Body copy stays on Arial on purpose, because it's the one face every client renders identically.

## Anatomy of a sheet

1. **"Customer copy"** in tracked caps on the blue field, above the sheet.
2. **Printed header.** On the left, `TRADE-X` and the form name ("Receipt", "Sign-up code"…). On the right, `No.` with the red serial (orders only) and `Date` with the value in carbon.
3. **Heavy double rule** (2px plus 1px ink).
4. **The mass.** The one thing the reader came for, first and largest: the code in a ruled box, or the naira figure with its kobo in a separate ruled cell. A heading takes this slot when the outcome is the news.
5. **The stamp.** A double-ruled red box stating the money or status outcome: `ONE-TIME USE`, `VERIFIED`, `PAID`, `NOT CHARGED`.
6. **Ruled table.** Columns `Qty | Description | ₦ | k`, with ink column rules, ruled rows, and a 2px ink rule above the total. Each description carries a muted unit-price line underneath.
7. **Fields.** A printed label over a dotted rule, with the value in carbon mono. On phones they stack: label above, value below.
8. **Action** (only when `APP_URL` is set). A square carbon block with white condensed caps.
9. **Duplicates.** Yellow and pink 7px strips, each inset further, beneath the sheet.
10. **Footer** on the field: who it was sent to and why, and "reply to this email".

## Rules

- Amounts are **naira and kobo in separate cells**, never "₦63,125.50" in the mass or table. Plain text and subjects use `ngn()`.
- Dates read `25 Sep 2026` and times read `3:42 PM WAT`, always in Africa/Lagos.
- "Trade-X" never breaks at its hyphen: body helpers wrap it in `nowrap`.
- There are no images. Every email is complete with images off, and every email has a plain-text version.
- `color-scheme: light only`: the sheet is paper and stays white. Gmail's forced inversion stays readable because every pair has high contrast.
- Layout: tables with inline styles; a 600px maximum width; one `@media (max-width:620px)` block for phone padding, stacking and type steps.
- Copy is warm and plain. Say exactly what happened to the money ("You have not been charged"). Never invent policies, support hours or addresses.

## Emails

| Template | Form name | Mass | Stamp | Queued by |
|---|---|---|---|---|
| `signup_code` | Sign-up code | 6-digit code box | ONE-TIME USE | sent directly on register / resend |
| `welcome` | Welcome | "Your account is ready" | VERIFIED | outbox, on email verification |
| `order_paid` | Receipt | amount paid | PAID | outbox, when `settle()` marks paid |
| `payment_failed` | Payment not completed | "Your payment didn't go through" / "Your reservation has ended" | NOT CHARGED | outbox, when `settle()` marks failed / expired |

To preview all of them locally, run `npm run email:preview` (writes `.email-previews/*.html` and `*.txt`).
