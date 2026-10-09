import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createPrisma } from './db.js';
import { loadRootEnv } from './env.js';

loadRootEnv();
const config = loadConfig();
const prisma = createPrisma(config.databaseUrl);
const app = createApp({ config, prisma });

const server = app.listen(config.port, () => {
  console.info(`Paperwork Pilot API listening on :${config.port} (${config.nodeEnv})`);
  if (!config.adminPassword) console.info('Admin panel is off (set ADMIN_PASSWORD to turn it on).');
  if (config.proEnabled) console.info('Professional plan is ON (PRO_ENABLED).');
});

function shutdown(signal: string) {
  console.info(`${signal} received, shutting down`);
  server.close(() => {
    void prisma.$disconnect().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => {
  shutdown('SIGTERM');
});
process.on('SIGINT', () => {
  shutdown('SIGINT');
});
