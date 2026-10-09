import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Integration tests share one Postgres database, so files run one after another.
    fileParallelism: false,
    globalSetup: ['./src/test/globalSetup.ts'],
    testTimeout: 20_000,
    hookTimeout: 60_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/generated/**', 'src/test/**', 'src/**/*.test.ts', 'src/server.ts'],
    },
  },
});
