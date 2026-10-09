import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { loadRootEnv } from './env.js';

loadRootEnv();
const config = loadConfig();
const app = createApp(config);

const server = app.listen(config.port, () => {
  console.info(`Paperwork Pilot API listening on :${config.port} (${config.nodeEnv})`);
});

function shutdown(signal: string) {
  console.info(`${signal} received, shutting down`);
  server.close(() => {
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => {
  shutdown('SIGTERM');
});
process.on('SIGINT', () => {
  shutdown('SIGINT');
});
