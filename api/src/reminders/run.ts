import { loadConfig } from '../config.js';
import { createPrisma } from '../db.js';
import { createEmailProvider } from '../email/provider.js';
import { loadRootEnv } from '../env.js';
import { runReminders } from './reminderJob.js';

/** Runs the reminder job once, right now (npm run reminders:run). Handy for testing and ops. */
loadRootEnv();
const config = loadConfig();
const prisma = createPrisma(config.databaseUrl);
try {
  const summary = await runReminders({
    prisma,
    email: createEmailProvider(config.emailProvider),
    config,
    now: new Date(),
  });
  console.info(JSON.stringify(summary));
} finally {
  await prisma.$disconnect();
}
