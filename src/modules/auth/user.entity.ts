import { EntitySchema } from 'typeorm'

// EntitySchema instead of decorators: Node runs our .ts directly (type stripping), which has no decorator support.
// Property names match column names in database/migrations/schema.sql.

export type Role = 'customer' | 'admin'
export type User = { id: string; email: string; password_hash: string; role: Role; email_verified_at: Date | null; created_at: Date }

export const UserEntity = new EntitySchema<User>({
  name: 'User', tableName: 'users',
  columns: {
    id: { type: 'uuid', primary: true, generated: 'uuid' },
    email: { type: 'text', unique: true },
    password_hash: { type: 'text' },
    role: { type: 'text', default: 'customer' },
    email_verified_at: { type: 'timestamptz', nullable: true },
    created_at: { type: 'timestamptz', createDate: true },
  },
})
