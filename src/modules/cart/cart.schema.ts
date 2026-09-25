import { z } from 'zod'

export const setItemBody = z.object({ quantity: z.number().int().min(1).max(100) })
