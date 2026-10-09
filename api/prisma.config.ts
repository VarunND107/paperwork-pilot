import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { defineConfig } from 'prisma/config';

// Prisma 7 no longer reads .env on its own. Load the monorepo-root .env (never overriding real
// environment variables). In Docker there is no .env file and the variables are already set.
function loadRootEnv(): void {
  let dir = resolve(process.cwd());
  for (;;) {
    const pkg = join(dir, 'package.json');
    if (existsSync(pkg) && readFileSync(pkg, 'utf8').includes('"workspaces"')) {
      const envFile = join(dir, '.env');
      if (existsSync(envFile)) process.loadEnvFile(envFile);
      return;
    }
    const parent = dirname(dir);
    if (parent === dir) return;
    dir = parent;
  }
}
loadRootEnv();

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx src/seed/run.ts',
  },
  datasource: {
    // `prisma generate` does not connect, so a placeholder keeps it working without a .env.
    url: process.env.DATABASE_URL ?? 'postgresql://paperwork:paperwork@localhost:5432/paperwork',
  },
});
