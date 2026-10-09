import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from './generated/prisma/client.js';

export { Prisma, PrismaClient };
export type Db = PrismaClient;
/** The client handed to a function inside `prisma.$transaction(async (tx) => ...)`. */
export type Tx = Prisma.TransactionClient;
/** Either the root client or a transaction client. */
export type DbOrTx = Db | Tx;

export function createPrisma(databaseUrl: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
}
