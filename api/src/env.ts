import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/**
 * Loads the monorepo-root `.env` (the folder whose package.json declares `workspaces`).
 * Variables that are already set in the real environment are never overridden.
 * Returns the file that was loaded, or null.
 */
export function loadRootEnv(startDir: string = process.cwd()): string | null {
  let dir = resolve(startDir);
  for (;;) {
    const pkg = join(dir, 'package.json');
    if (existsSync(pkg) && readFileSync(pkg, 'utf8').includes('"workspaces"')) {
      const envFile = join(dir, '.env');
      if (!existsSync(envFile)) return null;
      process.loadEnvFile(envFile);
      return envFile;
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
