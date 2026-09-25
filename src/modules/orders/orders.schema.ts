import { z } from 'zod'

// expectedTotal = the total the client showed the customer; a mismatch means prices moved (Scenario B).
export const checkoutBody = z.object({ expectedTotal: z.number().int().positive().optional() })
