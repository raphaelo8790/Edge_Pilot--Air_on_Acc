/**
 * The single PrismaClient for the process.
 *
 * Next.js hot-reloads modules in development, and a new PrismaClient per
 * reload exhausts the database's connection limit within a few edits. Caching
 * it on `globalThis` survives the reload; in production the module is
 * evaluated once and the global is never read.
 *
 * Official guidance:
 * https://www.prisma.io/docs/orm/more/help-and-troubleshooting/nextjs-help#recommended-solution
 */

import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['warn', 'error']
        : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
