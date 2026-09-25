function need(key: string): string {
  const v = process.env[key]
  if (!v) throw new Error(`Missing required env var ${key}`)
  return v
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: need('DATABASE_URL'),
  redisUrl: need('REDIS_URL'),
  jwtSecret: need('JWT_SECRET'),
  paystackSecret: need('PAYSTACK_SECRET_KEY'),
  paystackCallbackUrl: process.env.PAYSTACK_CALLBACK_URL,
  reservationMinutes: Number(process.env.RESERVATION_MINUTES ?? 15),
  adminEmail: process.env.ADMIN_EMAIL,
  adminPassword: process.env.ADMIN_PASSWORD,
  // Optional storefront URL; emails show a "back to the store" button only when it is set.
  // Run the background jobs inside the api process (e.g. Render free tier, no separate worker).
  runWorker: process.env.RUN_WORKER === 'true',
  appUrl: process.env.APP_URL?.replace(/\/$/, ''),
  // Empty key = dev mode: emails are logged instead of sent.
  brevoApiKey: process.env.BREVO_API_KEY ?? '',
  mailFrom: { email: process.env.BREVO_SENDER_EMAIL ?? 'no-reply@trade-x.local', name: process.env.BREVO_SENDER_NAME ?? 'Trade-X' },
}
