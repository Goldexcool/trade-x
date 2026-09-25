import type { NextFunction, Request, Response } from 'express'
import { ZodError } from 'zod'

export class HttpError extends Error {
  status: number
  details?: unknown
  constructor(status: number, message: string, details?: unknown) {
    super(message)
    this.status = status
    this.details = details
  }
}

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, details: err.details })
  if (err instanceof ZodError) return res.status(400).json({ error: 'Validation failed', details: err.issues })
  if ((err.driverError?.code ?? err.code) === '22P02') return res.status(400).json({ error: 'Invalid id' }) // malformed uuid
  if (err.expose) return res.status(err.status).json({ error: err.message }) // e.g. bad JSON body
  console.error(err)
  res.status(500).json({ error: 'Internal server error' })
}
