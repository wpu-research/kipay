import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import * as schema from './schema/index.js'

const client = postgres(process.env.DATABASE_URL!, { max: 10 })
export const db = drizzle(client, { schema })

export * from './schema/index.js'
export { runMigrations } from './migrate.js'
export { eq, and, or, sql, isNull, gt, ne, lt, gte, lte, inArray, not, count, desc, ilike } from 'drizzle-orm'
