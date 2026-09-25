import { z } from 'zod'

export const callbackQuery = z.object({ reference: z.string().min(1).max(100) })
