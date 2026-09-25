import { drainOutbox } from './modules/email/email.service.ts'
import { reconcilePending } from './modules/payments/payments.service.ts'

/** Run `task` forever: wait `everyMs` after each pass finishes (never overlapping itself). */
function every(name: string, everyMs: number, task: () => Promise<unknown>) {
  const loop = () => task()
    .catch(err => console.error(`${name} pass failed:`, err))
    .finally(() => setTimeout(loop, everyMs))
  loop()
  console.log(`${name} running every ${everyMs / 1000}s`)
}

/**
 * Background jobs. Run by the dedicated worker, or inside the api when RUN_WORKER=true.
 * Safe to run in several processes at once: the reconciler takes a Redis lock per pass,
 * and the outbox claims rows with SKIP LOCKED.
 */
export function startJobs() {
  every('reconciler', 60_000, reconcilePending)
  every('email outbox', 5_000, drainOutbox)
}
