# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Everyday Nigerian shoppers buying fashion, electronics and accessories, mostly on their phones, paying in naira through Paystack. They read Trade-X emails on Gmail (Android and web) far more than anywhere else, often on patchy data, and they open an email for one reason: a code to type, proof that they paid, or to find out what happened to an order.

## Product Purpose
Trade-X is a small online store: browse a catalog, fill a cart, pay with Paystack. Success means a shopper always knows where their money and their order stand, with no surprises: they are never charged a price they didn't see, and never sold an item that isn't there.

## Positioning
Stock is held for the shopper the moment they check out (a 15-minute reservation), and every payment is confirmed with Paystack, not with the browser. In emails, that means we can make promises precisely: "your items are held until 3:45 PM", "you were not charged".

## Operating Context
Transactional email is sent through Brevo from the backend.
- **Sign-up code (OTP):** 6 digits, valid 10 minutes, needed to finish registration.
- **Welcome:** sent once the email is verified.
- **Order confirmed:** sent when Paystack confirms payment. It includes an itemised receipt with the prices charged, the total and the Paystack reference.
- **Payment didn't go through:** sent when a payment fails, or the reservation expires unpaid. The items are released, and nothing was charged.

Amounts are naive naira (₦, kobo precision, displayed without kobo when whole). There is no customer-facing web frontend yet, so emails cannot rely on deep links into an app.

## Capabilities and Constraints
- The HTML must survive Gmail, Outlook (Word engine), Apple Mail and Yahoo. That means table layout, inline styles, no web fonts that fail badly, no background images carrying meaning, and a width of 600px or less.
- Every email ships a plain-text alternative.
- Emails must be safe in dark mode, including Gmail's forced colour inversion.
- There's no logo asset yet. The wordmark is text: "Trade-X".
- Not sent: the refund email. Refund handling stays admin-side for now.

## Brand Commitments
- Name: **Trade-X**. Sender name "Trade-X".
- Voice: warm and plain. Short sentences, no hype, no exclamation-mark enthusiasm. Money, codes and next steps are unmistakable.

## Evidence on Hand
No testimonials, press, customer numbers or policies exist. Do not invent a returns policy, support hours, a phone number or a physical address. The support contact is the sender address.

## Product Principles
1. The one thing the reader came for is the first thing they see: the code, the total, the outcome.
2. Say exactly what happened to their money. "You were not charged" beats "something went wrong".
3. Plain over clever. Nigerian shoppers on low-end Android phones and slow data come first.
4. Every email is complete on its own. It never depends on images loading or on a website existing.

## Accessibility & Inclusion
Readable with images off. Text contrast meets WCAG AA in both light and dark rendering. The OTP is live text (copyable), never an image. Emails set `lang="en"` and use semantic headings where clients allow.
