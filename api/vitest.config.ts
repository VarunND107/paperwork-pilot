import { defineConfig } from 'vitest/config';
import { resolveTestDatabaseUrl } from './src/test/testDatabaseUrl.js';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    env: { DATABASE_URL: resolveTestDatabaseUrl() },
    // Integration tests share one Postgres database, so files run one after another.
    fileParallelism: false,
    globalSetup: ['./src/test/globalSetup.ts'],
    testTimeout: 20_000,
    hookTimeout: 60_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/generated/**',
        'src/test/**',
        'src/**/*.test.ts',
        'src/server.ts',
        'src/seed/run.ts',
      ],
    },
  },
});
