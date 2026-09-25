import type { NextFunction, Request, Response } from 'express'
import jwt, { type JwtPayload } from 'jsonwebtoken'
import { config } from '../../config/env.ts'
import type { Role } from '../../modules/auth/user.entity.ts'
import { HttpError } from '../errors.ts'

export type AuthUser = { id: string; email: string; role: Role }

declare global {
  namespace Express {
    interface Request { user?: AuthUser }
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const token = req.get('authorization')?.replace(/^Bearer /i, '')
  if (!token) return next()
  try {
    const p = jwt.verify(token, config.jwtSecret) as JwtPayload
    req.user = { id: p.sub!, email: p.email, role: p.role }
    next()
  } catch {
    next(new HttpError(401, 'Invalid or expired token'))
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  next(req.user ? undefined : new HttpError(401, 'Authentication required'))
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(new HttpError(401, 'Authentication required'))
  next(req.user.role === 'admin' ? undefined : new HttpError(403, 'Admin only'))
}
