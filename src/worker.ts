import { connect } from './database/data-source.ts'
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

await connect() // the api owns migrations
every('reconciler', 60_000, reconcilePending)
every('email outbox', 5_000, drainOutbox)
