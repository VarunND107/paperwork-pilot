import { defineConfig } from '@playwright/test';

// The real servers and the demo-flow smoke test are wired up in phase 4.
export default defineConfig({
  testDir: './tests',
});
