import { createPrisma } from '../db.js';
import { loadRootEnv } from '../env.js';
import { seedDatabase } from './seed.js';

loadRootEnv();
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env or export it.');
  process.exit(1);
}

const prisma = createPrisma(databaseUrl);
try {
  const result = await seedDatabase(prisma);
  for (const slug of result.created) console.info(`Seeded sample event "${slug}" (verified=false)`);
  for (const slug of result.skipped) console.info(`Event "${slug}" already exists, left untouched`);
} finally {
  await prisma.$disconnect();
}
