import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { databaseUrl } from './env';

/**
 * Gives the smoke test a clean database: creates it if missing, applies migrations, empties every
 * table and seeds the sample events. The name must contain "e2e" because this wipes data.
 *
 * Runs as the first part of the API's start command (see playwright.config.ts), not as a
 * Playwright globalSetup: Playwright starts web servers before global setup, and the API's
 * health check needs this database to exist.
 */
async function prepare(): Promise<void> {
  const url = databaseUrl();
  const name = new URL(url).pathname.replace(/^\//, '');

  const admin = new URL(url);
  admin.pathname = '/postgres';
  const server = new pg.Client({ connectionString: admin.toString() });
  await server.connect();
  try {
    const found = await server.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (found.rowCount === 0) await server.query(`CREATE DATABASE "${name.replace(/"/g, '""')}"`);
  } finally {
    await server.end();
  }

  const apiDir = fileURLToPath(new URL('../api', import.meta.url));
  const env = { ...process.env, DATABASE_URL: url };
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], { cwd: apiDir, env, stdio: 'pipe' });

  const db = new pg.Client({ connectionString: url });
  await db.connect();
  try {
    const tables = await db.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'",
    );
    if (tables.rows.length > 0) {
      const list = tables.rows.map((t) => `"${t.tablename}"`).join(', ');
      await db.query(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
    }
  } finally {
    await db.end();
  }

  execFileSync('npx', ['tsx', 'src/seed/run.ts'], { cwd: apiDir, env, stdio: 'pipe' });
}

await prepare();
