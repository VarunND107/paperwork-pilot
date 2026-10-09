/**
 * The database the API tests run against. Tests TRUNCATE tables, so the database name must
 * contain "test": anything else is refused.
 *
 * Order: TEST_DATABASE_URL, then DATABASE_URL (CI sets this to paperwork_test), then a local default.
 */
export function resolveTestDatabaseUrl(
  env: Record<string, string | undefined> = process.env,
): string {
  const url =
    env.TEST_DATABASE_URL ??
    env.DATABASE_URL ??
    'postgresql://postgres@127.0.0.1:5432/paperwork_test';
  const name = new URL(url).pathname.replace(/^\//, '');
  if (!/test/i.test(name)) {
    throw new Error(
      `Refusing to run tests against database "${name}": tests wipe data, so its name must contain "test". ` +
        'Set TEST_DATABASE_URL to a throwaway database.',
    );
  }
  return url;
}
