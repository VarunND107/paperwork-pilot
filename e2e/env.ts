/** The database the smoke test runs against. It is wiped, so its name must contain "e2e". */
export function databaseUrl(): string {
  const url =
    process.env.E2E_DATABASE_URL ??
    process.env.DATABASE_URL ??
    'postgresql://postgres@127.0.0.1:5432/paperwork_e2e';
  const name = new URL(url).pathname.replace(/^\//, '');
  if (!/e2e/i.test(name)) {
    throw new Error(
      `Refusing to run the smoke test against database "${name}": it is emptied first, so the name must contain "e2e". Set E2E_DATABASE_URL.`,
    );
  }
  return url;
}

export const API_PORT = 4010;
export const WEB_PORT = 5183;
