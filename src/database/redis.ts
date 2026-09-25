import { Redis } from 'ioredis'
import { config } from '../config/env.ts'

export const redis = new Redis(config.redisUrl, { maxRetriesPerRequest: 2 })
// ioredis reconnects on its own; without a listener every failed attempt logs "Unhandled error event".
redis.on('error', err => console.error('redis:', err.message))
