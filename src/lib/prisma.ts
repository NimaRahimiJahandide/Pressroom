/**
 * prisma.ts
 * ==========
 * Prisma singleton — prevents multiple PrismaClient instances
 * in development (Next.js hot-reload recreates modules).
 */

import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}