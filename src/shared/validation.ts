import { z } from 'zod'

export const uuidParam = (v: unknown) => z.uuid().parse(v)
