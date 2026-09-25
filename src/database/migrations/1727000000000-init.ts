import { readFileSync } from 'node:fs'
import type { MigrationInterface, QueryRunner } from 'typeorm'

// Hand-written SQL: CHECK constraints (stock >= 0, status values) are part of the correctness story,
// so the schema lives in SQL rather than being generated from entities.
export class Init1727000000000 implements MigrationInterface {
  name = 'Init1727000000000'
  async up(q: QueryRunner) {
    await q.query(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'))
  }
  async down(q: QueryRunner) {
    await q.query('DROP TABLE IF EXISTS webhook_events, order_items, orders, cart_items, products, users')
  }
}
