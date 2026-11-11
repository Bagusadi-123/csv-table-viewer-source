import { PrismaClient } from '@prisma/client'

// CATATAN: JANGAN aktifkan log: ['query'] di sini. Logging per-query
// membuat import file besar (jutaan baris, ribuan batch INSERT) menahan
// string SQL/parameter besar di memori dan bisa memicu Out of Memory.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
