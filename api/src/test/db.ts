import { createPrisma, type Db } from '../db.js';
import { resolveTestDatabaseUrl } from './testDatabaseUrl.js';

export function createTestPrisma(): Db {
  return createPrisma(resolveTestDatabaseUrl());
}

/** Empties every table (except Prisma's migration history). */
export async function resetDatabase(prisma: Db): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;
  const list = tables.map((t) => `"${t.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
}
