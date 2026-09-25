import type { NextFunction, Request, Response } from 'express'
import { redis } from '../../database/redis.ts'
import { HttpError } from '../errors.ts'

// Fixed-window limiter in Redis. Fails open: Redis down must not lock users out.
export const rateLimit = (limit: number, windowSec: number) =>
  async (req: Request, _res: Response, next: NextFunction) => {
    const key = `rl:${req.path}:${req.ip}:${Math.floor(Date.now() / 1000 / windowSec)}`
    const hits = await redis.multi().incr(key).expire(key, windowSec).exec()
      .then(r => Number(r?.[0]?.[1] ?? 0), () => 0)
    next(hits > limit ? new HttpError(429, 'Too many requests, try again shortly') : undefined)
  }
