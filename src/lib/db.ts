import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Memory note: per-query SQL logging (log: ['query']) formatted and retained
// a string for every query the server ever ran — removed. The client is
// cached on globalThis unconditionally so dev HMR never spawns a second
// connection pool.
export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['error', 'warn'],
  })

globalForPrisma.prisma = db