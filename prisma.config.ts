import { defineConfig, env } from 'prisma/config'

// Prisma 7 config (replaces datasource.url in schema.prisma). Used by the CLI
// for migrate/introspect; the runtime client uses the driver adapter (src/server/db.ts).
export default defineConfig({
  schema: 'apps/web-app/prisma/schema.prisma',
  migrations: { path: 'apps/web-app/prisma/migrations' },
  datasource: { url: env('DATABASE_URL') },
})
