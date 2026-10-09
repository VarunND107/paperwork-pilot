import type { Express } from 'express';
import request from 'supertest';
import { createApp, type AppDeps } from '../app.js';
import { loadConfig, type Config } from '../config.js';
import type { Db } from '../db.js';
import type { CaseView, StepView } from '../services/types.js';
import { createTestPrisma } from './db.js';
import { resolveTestDatabaseUrl } from './testDatabaseUrl.js';

/** 11:30 am in India on Friday 9 October 2026. */
export const FIXED_NOW = new Date('2026-10-09T06:00:00Z');
export const TEST_ADMIN_PASSWORD = 'test-admin-password-123';

export interface TestApp {
  app: Express;
  prisma: Db;
  config: Config;
  /** Move the app's clock. */
  setNow: (date: Date) => void;
  close: () => Promise<void>;
}

export function testConfig(overrides: Record<string, string> = {}): Config {
  return loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: resolveTestDatabaseUrl(),
    ADMIN_PASSWORD: TEST_ADMIN_PASSWORD,
    SESSION_SECRET: 'test-session-secret-0123456789abcdef',
    PRO_ENABLED: 'true',
    PUBLIC_URL: 'http://localhost:8080',
    ...overrides,
  });
}

export function createTestApp(
  options: {
    config?: Config;
    prisma?: Db;
    rateLimits?: AppDeps['rateLimits'];
    extra?: Partial<AppDeps>;
  } = {},
): TestApp {
  const prisma = options.prisma ?? createTestPrisma();
  const config = options.config ?? testConfig();
  let now = FIXED_NOW;
  const app = createApp({
    config,
    prisma,
    clock: () => now,
    rateLimits: options.rateLimits,
    ...options.extra,
  });
  return {
    app,
    prisma,
    config,
    setNow: (date) => {
      now = date;
    },
    close: async () => {
      if (!options.prisma) await prisma.$disconnect();
    },
  };
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

export interface StartedCase {
  id: string;
  token: string;
  view: CaseView;
}

/** POST /cases and return the id, token and first view. */
export async function startCase(
  app: Express,
  eventId: string,
  eventDate?: string,
): Promise<StartedCase> {
  const res = await request(app)
    .post('/cases')
    .send({ eventId, ...(eventDate ? { eventDate } : {}) });
  if (res.status !== 201)
    throw new Error(`createCase failed: ${res.status} ${JSON.stringify(res.body)}`);
  const body = res.body as { token: string; case: CaseView };
  return { id: body.case.id, token: body.token, view: body.case };
}

export async function fetchCase(
  app: Express,
  c: Pick<StartedCase, 'id' | 'token'>,
): Promise<CaseView> {
  const res = await request(app).get(`/cases/${c.id}`).set(bearer(c.token));
  if (res.status !== 200) throw new Error(`getCase failed: ${res.status}`);
  return (res.body as { case: CaseView }).case;
}

export function stepAt(view: CaseView, number: number): StepView {
  const step = view.steps.find((s) => s.number === number);
  if (!step) throw new Error(`No step ${number}`);
  return step;
}

/** Ticks every document the user has to carry for a step, then marks the step done. */
export async function completeStep(
  app: Express,
  c: StartedCase,
  number: number,
): Promise<CaseView> {
  const view = await fetchCase(app, c);
  const step = stepAt(view, number);
  for (const doc of step.documents.filter((d) => d.state === 'open')) {
    const tick = await request(app)
      .patch(`/cases/${c.id}/documents/${doc.documentId}`)
      .set(bearer(c.token))
      .send({ ticked: true });
    if (tick.status !== 200)
      throw new Error(`tick failed: ${tick.status} ${JSON.stringify(tick.body)}`);
  }
  const res = await request(app)
    .patch(`/cases/${c.id}/steps/${step.id}`)
    .set(bearer(c.token))
    .send({ done: true });
  if (res.status !== 200) throw new Error(`done failed: ${res.status} ${JSON.stringify(res.body)}`);
  return (res.body as { case: CaseView }).case;
}
