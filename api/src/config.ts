import { randomBytes } from 'node:crypto';
import { z } from 'zod';

/** "true" / "1" / "yes" / "on" are true, everything else (including unset) is the default. */
const flag = (fallback: boolean) =>
  z
    .string()
    .optional()
    .transform((v) =>
      v === undefined || v.trim() === '' ? fallback : /^(true|1|yes|on)$/i.test(v.trim()),
    );

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  /** Public base URL of the web app. Used in reminder emails. */
  PUBLIC_URL: z.url().default('http://localhost:8080'),
  /** Admin panel is disabled while this is empty. */
  ADMIN_PASSWORD: z.string().optional(),
  /** Signs admin sessions and unsubscribe links. */
  SESSION_SECRET: z.string().optional(),
  PRO_ENABLED: flag(false),
  EMAIL_PROVIDER: z.enum(['console']).default('console'),
  REMINDERS_ENABLED: flag(true),
  /** node-cron expression, evaluated in Asia/Kolkata. */
  REMINDER_CRON: z.string().default('0 9 * * *'),
});

export interface Config {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  databaseUrl: string;
  publicUrl: string;
  /** Empty string means the admin panel is disabled. */
  adminPassword: string;
  sessionSecret: string;
  proEnabled: boolean;
  emailProvider: 'console';
  remindersEnabled: boolean;
  reminderCron: string;
}

/** Values that ship in .env.example. They must never protect a real deployment. */
const PLACEHOLDER = /^change-?me/i;

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`);
  }
  const e = parsed.data;
  const production = e.NODE_ENV === 'production';

  let adminPassword = (e.ADMIN_PASSWORD ?? '').trim();
  if (adminPassword && production && PLACEHOLDER.test(adminPassword)) {
    console.warn('ADMIN_PASSWORD is still the .env.example placeholder. Admin panel disabled.');
    adminPassword = '';
  }

  let sessionSecret = (e.SESSION_SECRET ?? '').trim();
  if (production && (sessionSecret.length < 16 || PLACEHOLDER.test(sessionSecret))) {
    throw new Error(
      'SESSION_SECRET must be a random string of 16+ characters in production. ' +
        'Run start.bat / start.sh, which generate one, or set it in .env.',
    );
  }
  if (!sessionSecret) {
    // Development and tests only: a random per-process secret, so sessions end on restart.
    sessionSecret = randomBytes(32).toString('hex');
  }

  return {
    nodeEnv: e.NODE_ENV,
    port: e.PORT,
    databaseUrl: e.DATABASE_URL,
    publicUrl: e.PUBLIC_URL.replace(/\/+$/, ''),
    adminPassword,
    sessionSecret,
    proEnabled: e.PRO_ENABLED,
    emailProvider: e.EMAIL_PROVIDER,
    remindersEnabled: e.REMINDERS_ENABLED,
    reminderCron: e.REMINDER_CRON,
  };
}
