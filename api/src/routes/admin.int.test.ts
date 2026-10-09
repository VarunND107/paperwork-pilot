import request from 'supertest';
import type TestAgent from 'supertest/lib/agent.js';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type {
  AdminDocumentRow,
  AdminEventRow,
  AdminOfficeRow,
  AdminStepRow,
} from '../admin/types.js';
import { seedDatabase } from '../seed/seed.js';
import type { RouteResponse } from '../services/types.js';
import {
  createTestApp,
  FIXED_NOW,
  startCase,
  TEST_ADMIN_PASSWORD,
  testConfig,
} from '../test/appKit.js';
import { resetDatabase } from '../test/db.js';

const t = createTestApp();
const SOURCE = 'https://crsorgi.gov.in/';
const prov = { sourceUrl: SOURCE, verified: false };
const DAY = 86_400_000;

beforeEach(async () => {
  await resetDatabase(t.prisma);
  await seedDatabase(t.prisma);
  t.setNow(FIXED_NOW);
});
afterAll(async () => {
  await t.close();
});

async function login(app = t.app): Promise<TestAgent> {
  const agent = request.agent(app);
  const res = await agent.post('/admin/login').send({ password: TEST_ADMIN_PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

async function eventBySlug(agent: TestAgent, slug: string) {
  const list = (await agent.get('/admin/events')).body as { events: AdminEventRow[] };
  const event = list.events.find((e) => e.slug === slug);
  if (!event) throw new Error(`no event ${slug}`);
  const detail = (await agent.get(`/admin/events/${event.id}`)).body as {
    event: AdminEventRow;
    steps: AdminStepRow[];
  };
  return detail;
}

describe('admin: sign-in', () => {
  it('reports whether the panel is on and whether you are signed in', async () => {
    const res = await request(t.app).get('/admin/session');
    expect(res.body).toEqual({ enabled: true, authenticated: false });
  });

  it('refuses every admin route without a session', async () => {
    const calls = [
      request(t.app).get('/admin/events'),
      request(t.app).post('/admin/events').send({}),
      request(t.app).get('/admin/events/x'),
      request(t.app).patch('/admin/events/x').send({}),
      request(t.app).delete('/admin/events/x'),
      request(t.app).post('/admin/events/x/steps').send({}),
      request(t.app).get('/admin/steps/x'),
      request(t.app).patch('/admin/steps/x').send({}),
      request(t.app).delete('/admin/steps/x'),
      request(t.app).put('/admin/steps/x/dependencies').send({}),
      request(t.app).post('/admin/steps/x/dependencies').send({}),
      request(t.app).delete('/admin/steps/x/dependencies/y').send({}),
      request(t.app).put('/admin/steps/x/documents').send({}),
      request(t.app).get('/admin/documents'),
      request(t.app).post('/admin/documents').send({}),
      request(t.app).patch('/admin/documents/x').send({}),
      request(t.app).delete('/admin/documents/x'),
      request(t.app).get('/admin/offices'),
      request(t.app).post('/admin/offices').send({}),
      request(t.app).patch('/admin/offices/x').send({}),
      request(t.app).delete('/admin/offices/x'),
    ];
    for (const res of await Promise.all(calls)) {
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('unauthorized');
    }
  });

  it('rejects a wrong password without setting a cookie', async () => {
    const res = await request(t.app).post('/admin/login').send({ password: 'nope' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('invalid_password');
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('signs in with the right password using an httpOnly, SameSite=Strict cookie', async () => {
    const res = await request(t.app).post('/admin/login').send({ password: TEST_ADMIN_PASSWORD });
    expect(res.status).toBe(200);
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toContain('pp_admin=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Path=/');
    expect(cookie).not.toContain(TEST_ADMIN_PASSWORD);
    expect(cookie).not.toContain('Secure');
  });

  it('marks the cookie Secure when the request came over https', async () => {
    const res = await request(t.app)
      .post('/admin/login')
      .set('X-Forwarded-Proto', 'https')
      .send({ password: TEST_ADMIN_PASSWORD });
    expect(String(res.headers['set-cookie'])).toContain('Secure');
  });

  it('then lets you in, and reports you as signed in', async () => {
    const agent = await login();
    expect((await agent.get('/admin/session')).body).toEqual({
      enabled: true,
      authenticated: true,
    });
    expect((await agent.get('/admin/events')).status).toBe(200);
  });

  it('signs out', async () => {
    const agent = await login();
    await agent.post('/admin/logout').send();
    expect((await agent.get('/admin/events')).status).toBe(401);
  });

  it('ends a session after 12 hours', async () => {
    const agent = await login();
    t.setNow(new Date(FIXED_NOW.getTime() + 11 * 3_600_000));
    expect((await agent.get('/admin/events')).status).toBe(200);
    t.setNow(new Date(FIXED_NOW.getTime() + 13 * 3_600_000));
    expect((await agent.get('/admin/events')).status).toBe(401);
  });

  it('rejects a tampered or forged cookie', async () => {
    const agent = await login();
    const forged = Buffer.from(JSON.stringify({ exp: FIXED_NOW.getTime() + 1e9 })).toString(
      'base64url',
    );
    for (const value of [`${forged}.AAAA`, `${forged}.`, 'garbage', `${forged}.x.y`]) {
      const res = await request(t.app).get('/admin/events').set('Cookie', `pp_admin=${value}`);
      expect(res.status, value).toBe(401);
    }
    expect((await agent.get('/admin/events')).status).toBe(200);
  });

  it('rejects a cookie signed with a different secret', async () => {
    const other = createTestApp({
      prisma: t.prisma,
      config: testConfig({ SESSION_SECRET: 'a-completely-different-secret-value' }),
    });
    const res = await request(other.app)
      .post('/admin/login')
      .send({ password: TEST_ADMIN_PASSWORD });
    const cookie = String(res.headers['set-cookie']).split(';')[0] ?? '';
    expect((await request(t.app).get('/admin/events').set('Cookie', cookie)).status).toBe(401);
  });

  it('validates the login body', async () => {
    for (const body of [{}, { password: '' }, { password: 'x', extra: 1 }]) {
      expect((await request(t.app).post('/admin/login').send(body)).status).toBe(400);
    }
  });

  it('rate limits login attempts', async () => {
    const limited = createTestApp({ prisma: t.prisma, rateLimits: { adminLogin: 3 } });
    for (let i = 0; i < 3; i++) {
      expect(
        (await request(limited.app).post('/admin/login').send({ password: 'bad' })).status,
      ).toBe(401);
    }
    const res = await request(limited.app)
      .post('/admin/login')
      .send({ password: TEST_ADMIN_PASSWORD });
    expect(res.status).toBe(429);
  });

  it('refuses writes that name another site as their origin', async () => {
    const agent = await login();
    const evil = await agent
      .post('/admin/documents')
      .set('Origin', 'https://evil.example')
      .send({ name: 'Sneaky', ...prov });
    expect(evil.status).toBe(403);
    const fine = await agent
      .post('/admin/documents')
      .set('Origin', 'http://localhost:8080')
      .send({ name: 'Fine', ...prov });
    expect(fine.status).toBe(201);
    const sameHost = await agent
      .post('/admin/documents')
      .set('Host', 'admin.example.org')
      .set('Origin', 'https://admin.example.org')
      .send({ name: 'Same host', ...prov });
    expect(sameHost.status).toBe(201);
  });
});

describe('admin: switched off without ADMIN_PASSWORD', () => {
  it('says so, and nothing works', async () => {
    const off = createTestApp({ prisma: t.prisma, config: testConfig({ ADMIN_PASSWORD: '' }) });
    expect((await request(off.app).get('/admin/session')).body).toEqual({
      enabled: false,
      authenticated: false,
    });
    const login503 = await request(off.app).post('/admin/login').send({ password: 'anything' });
    expect(login503.status).toBe(503);
    expect(login503.body.error.code).toBe('admin_disabled');
    expect((await request(off.app).get('/admin/events')).status).toBe(503);
    expect((await request(off.app).get('/config')).body.adminEnabled).toBe(false);
  });
});

describe('admin: events', () => {
  it('lists the situations with how many steps are stale or unverified', async () => {
    const agent = await login();
    const { events } = (await agent.get('/admin/events')).body as { events: AdminEventRow[] };
    expect(events.map((e) => e.slug)).toEqual(['death', 'move', 'biz']);
    expect(events[0]).toMatchObject({
      stepCount: 6,
      staleStepCount: 6,
      unverifiedStepCount: 6,
      caseCount: 0,
      verified: false,
      stale: true,
    });
  });

  it('creates an event, stamping last_verified_at and cleaning the keywords', async () => {
    const agent = await login();
    const res = await agent.post('/admin/events').send({
      slug: 'marriage',
      label: 'Getting married',
      keywords: ['  Marriage ', 'wedding', 'marriage', 'MARRI*'],
      ...prov,
    });
    expect(res.status).toBe(201);
    expect(res.body.event).toMatchObject({
      slug: 'marriage',
      label: 'Getting married',
      place: 'Bengaluru, Karnataka',
      keywords: ['marriage', 'wedding', 'marri*'],
      position: 4,
      verified: false,
      lastVerifiedAt: FIXED_NOW.toISOString(),
      sourceUrl: SOURCE,
      stepCount: 0,
    });
  });

  it('asks for a source on every edit', async () => {
    const agent = await login();
    const missing = await agent.post('/admin/events').send({ slug: 'x-event', label: 'No source' });
    expect(missing.status).toBe(400);
    expect(missing.body.error.code).toBe('validation_error');
    const patch = await agent.patch('/admin/events/whatever').send({ label: 'No source' });
    expect(patch.status).toBe(400);
  });

  it.each([
    'javascript:alert(1)',
    'ftp://example.org/x',
    'data:text/html,hi',
    'not a url',
    '',
    '//evil.example',
  ])('refuses the source "%s": only http(s) links are allowed', async (sourceUrl) => {
    const agent = await login();
    const res = await agent
      .post('/admin/events')
      .send({ slug: 'bad-link', label: 'Bad link', sourceUrl });
    expect(res.status).toBe(400);
  });

  it('rejects a duplicate or invalid slug', async () => {
    const agent = await login();
    const dup = await agent.post('/admin/events').send({ slug: 'death', label: 'Again', ...prov });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('slug_taken');
    for (const slug of ['Has Space', 'UPPER_case', '-lead', 'trail-', 'a--b', '']) {
      const res = await agent.post('/admin/events').send({ slug, label: 'x event', ...prov });
      expect(res.status, slug).toBe(400);
    }
  });

  it('edits an event and re-stamps it, but never verifies by accident', async () => {
    const agent = await login();
    const { event } = await eventBySlug(agent, 'biz');
    t.setNow(new Date(FIXED_NOW.getTime() + DAY));
    const later = await login(); // a session lasts 12 hours
    const res = await later
      .patch(`/admin/events/${event.id}`)
      .send({ label: 'Starting a business', keywords: ['gst'], sourceUrl: SOURCE, verified: true });
    expect(res.body.event).toMatchObject({
      label: 'Starting a business',
      keywords: ['gst'],
      verified: true,
      lastVerifiedAt: new Date(FIXED_NOW.getTime() + DAY).toISOString(),
    });
    const again = await later
      .patch(`/admin/events/${event.id}`)
      .send({ place: 'Mysuru', sourceUrl: SOURCE });
    expect(again.body.event.verified).toBe(false);
  });

  it('refuses unknown fields (no mass assignment)', async () => {
    const agent = await login();
    const { event } = await eventBySlug(agent, 'biz');
    const res = await agent.patch(`/admin/events/${event.id}`).send({ id: 'hacked', ...prov });
    expect(res.status).toBe(400);
  });

  it('404s for an event that does not exist', async () => {
    const agent = await login();
    expect((await agent.get('/admin/events/nope')).status).toBe(404);
    expect((await agent.patch('/admin/events/nope').send({ label: 'xx', ...prov })).status).toBe(
      404,
    );
    expect((await agent.delete('/admin/events/nope')).status).toBe(404);
  });

  it('deletes an unused event with its steps, but not one that has cases', async () => {
    const agent = await login();
    const { event } = await eventBySlug(agent, 'biz');
    await startCase(t.app, 'biz');
    const blocked = await agent.delete(`/admin/events/${event.id}`);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('event_in_use');
    expect(blocked.body.error.message).toContain('1 case uses this situation');

    await t.prisma.case.deleteMany();
    expect((await agent.delete(`/admin/events/${event.id}`)).status).toBe(204);
    expect(await t.prisma.step.count({ where: { eventId: event.id } })).toBe(0);
  });
});

describe('admin: the stale badge', () => {
  it('flags a step that was never verified', async () => {
    const agent = await login();
    const { steps } = await eventBySlug(agent, 'death');
    expect(steps.every((s) => s.stale && s.lastVerifiedAt === null && !s.verified)).toBe(true);
  });

  it('clears when verified, and returns after 90 days', async () => {
    const agent = await login();
    const { steps } = await eventBySlug(agent, 'death');
    const step = steps[1] as AdminStepRow;
    const res = await agent
      .patch(`/admin/steps/${step.id}`)
      .send({ fee: 'Free', sourceUrl: SOURCE, verified: true });
    expect(res.body.step).toMatchObject({
      stale: false,
      verified: true,
      lastVerifiedAt: FIXED_NOW.toISOString(),
    });

    t.setNow(new Date(FIXED_NOW.getTime() + 90 * DAY));
    let admin = await login();
    let now = (await admin.get(`/admin/steps/${step.id}`)).body.step as AdminStepRow;
    expect(now.stale).toBe(false);
    t.setNow(new Date(FIXED_NOW.getTime() + 91 * DAY));
    admin = await login();
    now = (await admin.get(`/admin/steps/${step.id}`)).body.step as AdminStepRow;
    expect(now.stale).toBe(true);

    const detail = await eventBySlug(admin, 'death');
    expect(detail.event.staleStepCount).toBe(6);
    t.setNow(FIXED_NOW);
    expect((await eventBySlug(await login(), 'death')).event).toMatchObject({
      staleStepCount: 5,
      unverifiedStepCount: 5,
    });
  });

  it('even an unverified edit sets last_verified_at (the date of the edit), but not verified', async () => {
    const agent = await login();
    const { steps } = await eventBySlug(agent, 'death');
    const step = steps[0] as AdminStepRow;
    const res = await agent.patch(`/admin/steps/${step.id}`).send({ fee: 'Rs 10', ...prov });
    expect(res.body.step).toMatchObject({
      verified: false,
      lastVerifiedAt: FIXED_NOW.toISOString(),
      stale: false,
      fee: 'Rs 10',
    });
  });
});

describe('admin: edits reach the public site', () => {
  it('shows an edited step, and marks it verified only when an admin says so', async () => {
    const agent = await login();
    const { steps } = await eventBySlug(agent, 'death');
    const step = steps[1] as AdminStepRow;
    await agent.patch(`/admin/steps/${step.id}`).send({
      fee: 'Rs 50 after 21 days',
      sourceUrl: 'https://example.gov.in/rule',
      verified: true,
    });
    const route = (await request(t.app).get('/events/death/route')).body as RouteResponse;
    expect(route.steps[1]).toMatchObject({
      fee: 'Rs 50 after 21 days',
      verification: {
        verified: true,
        sourceUrl: 'https://example.gov.in/rule',
        lastVerifiedAt: FIXED_NOW.toISOString(),
        stale: false,
      },
    });
    // The other steps are still sample data.
    expect(route.steps.filter((s) => s.verification.verified)).toHaveLength(1);
    expect(route.event.isSample).toBe(true);
  });

  it('a step added later shows up in cases that already exist', async () => {
    const agent = await login();
    const c = await startCase(t.app, 'death');
    const { event } = await eventBySlug(agent, 'death');
    const res = await agent.post(`/admin/events/${event.id}/steps`).send({
      title: 'Cancel the passport',
      form: 'Online form',
      whereText: 'Passport portal',
      fee: 'Free',
      waitText: 'A week',
      dueText: 'Whenever',
      ...prov,
    });
    expect(res.status).toBe(201);
    const view = (
      await request(t.app).get(`/cases/${c.id}`).set('Authorization', `Bearer ${c.token}`)
    ).body.case;
    expect(view.progress.total).toBe(7);
    expect(view.steps[6]).toMatchObject({ title: 'Cancel the passport', status: 'ready' });
  });
});

describe('admin: steps', () => {
  const newStep = (over: Record<string, unknown> = {}) => ({
    title: 'Notify the employer',
    form: 'Letter',
    whereText: 'HR desk',
    fee: 'Free',
    waitText: 'Same day',
    dueText: 'Within a week',
    ...prov,
    ...over,
  });

  it('creates a step with dependencies, documents, an office and a machine-readable deadline', async () => {
    const agent = await login();
    const { event, steps } = await eventBySlug(agent, 'death');
    const offices = ((await agent.get('/admin/offices')).body as { offices: AdminOfficeRow[] })
      .offices;
    const docs = ((await agent.get('/admin/documents')).body as { documents: AdminDocumentRow[] })
      .documents;
    const regno = docs.find((d) => d.name === 'Registration number') as AdminDocumentRow;
    const s2 = steps[1] as AdminStepRow;
    const res = await agent.post(`/admin/events/${event.id}/steps`).send(
      newStep({
        needs: [s2.id],
        officeId: (offices[0] as AdminOfficeRow).id,
        dueAmount: 2,
        dueUnit: 'WEEK',
        documents: [
          {
            documentId: regno.id,
            role: 'REQUIRES',
            producedByStepId: s2.id,
            label: 'Registration number (from step 2)',
          },
        ],
      }),
    );
    expect(res.status).toBe(201);
    expect(res.body.step).toMatchObject({
      title: 'Notify the employer',
      position: 7,
      dueAmount: 2,
      dueUnit: 'WEEK',
      needs: [{ id: s2.id, title: 'Register the death' }],
      verified: false,
      lastVerifiedAt: FIXED_NOW.toISOString(),
    });
    expect(res.body.step.documents).toEqual([
      expect.objectContaining({
        documentName: 'Registration number',
        role: 'REQUIRES',
        producedByStepId: s2.id,
        label: 'Registration number (from step 2)',
      }),
    ]);
  });

  it('puts the new step into the public route in order', async () => {
    const agent = await login();
    const { event, steps } = await eventBySlug(agent, 'death');
    await agent
      .post(`/admin/events/${event.id}/steps`)
      .send(newStep({ needs: [(steps[5] as AdminStepRow).id] }));
    const route = (await request(t.app).get('/events/death/route')).body as RouteResponse;
    expect(route.steps.map((s) => s.title).at(-1)).toBe('Notify the employer');
    expect(route.steps.at(-1)?.blockedBy.map((b) => b.number)).toEqual([6]);
  });

  it('rejects a need from another situation, a missing office and a missing document', async () => {
    const agent = await login();
    const death = await eventBySlug(agent, 'death');
    const move = await eventBySlug(agent, 'move');
    const foreign = (move.steps[0] as AdminStepRow).id;
    const eventId = death.event.id;
    const a = await agent
      .post(`/admin/events/${eventId}/steps`)
      .send(newStep({ needs: [foreign] }));
    expect(a.status).toBe(400);
    expect(a.body.error.code).toBe('unknown_step');
    const b = await agent
      .post(`/admin/events/${eventId}/steps`)
      .send(newStep({ officeId: 'nope' }));
    expect(b.body.error.code).toBe('unknown_office');
    const c = await agent
      .post(`/admin/events/${eventId}/steps`)
      .send(newStep({ documents: [{ documentId: 'nope', role: 'REQUIRES' }] }));
    expect(c.body.error.code).toBe('unknown_document');
    expect(await t.prisma.step.count({ where: { eventId } })).toBe(6); // nothing half-saved
  });

  it('needs both an amount and a unit for a deadline, or neither', async () => {
    const agent = await login();
    const { event } = await eventBySlug(agent, 'death');
    const bad = await agent.post(`/admin/events/${event.id}/steps`).send(newStep({ dueAmount: 5 }));
    expect(bad.status).toBe(400);
    const bad2 = await agent
      .post(`/admin/events/${event.id}/steps`)
      .send(newStep({ dueAmount: null, dueUnit: 'DAY' }));
    expect(bad2.status).toBe(400);
    const none = await agent.post(`/admin/events/${event.id}/steps`).send(newStep());
    expect(none.body.step).toMatchObject({ dueAmount: null, dueUnit: null });
  });

  it('validates field lengths and types', async () => {
    const agent = await login();
    const { event } = await eventBySlug(agent, 'death');
    for (const over of [
      { title: '' },
      { title: 'x'.repeat(201) },
      { dueAmount: -1, dueUnit: 'DAY' },
      { dueAmount: 1.5, dueUnit: 'DAY' },
      { dueUnit: 'YEAR', dueAmount: 1 },
      { position: -1 },
    ]) {
      const res = await agent.post(`/admin/events/${event.id}/steps`).send(newStep(over));
      expect(res.status, JSON.stringify(over)).toBe(400);
    }
  });

  it('updates a step and its machine-readable deadline', async () => {
    const agent = await login();
    const { steps } = await eventBySlug(agent, 'death');
    const s2 = steps[1] as AdminStepRow;
    const res = await agent
      .patch(`/admin/steps/${s2.id}`)
      .send({ dueText: 'Within 30 days', dueAmount: 30, dueUnit: 'DAY', ...prov });
    expect(res.body.step).toMatchObject({
      dueText: 'Within 30 days',
      dueAmount: 30,
      dueUnit: 'DAY',
      title: 'Register the death',
    });
    const clear = await agent
      .patch(`/admin/steps/${s2.id}`)
      .send({ dueAmount: null, dueUnit: null, ...prov });
    expect(clear.body.step).toMatchObject({ dueAmount: null, dueUnit: null });
  });

  it('deletes a step; steps that waited for it stop waiting', async () => {
    const agent = await login();
    const { steps } = await eventBySlug(agent, 'death');
    const [, s2, s3] = steps as [AdminStepRow, AdminStepRow, AdminStepRow];
    expect((await agent.delete(`/admin/steps/${s2.id}`)).status).toBe(204);
    const after = (await agent.get(`/admin/steps/${s3.id}`)).body.step as AdminStepRow;
    expect(after.needs).toEqual([]);
    // Its "Registration number" now has no producer, so it becomes something the user ticks.
    expect(
      after.documents.find((d) => d.documentName === 'Registration number')?.producedByStepId,
    ).toBeNull();
    expect((await agent.delete(`/admin/steps/${s2.id}`)).status).toBe(404);
  });

  it('gives an editor everything it needs in one call: the step, its event and its siblings', async () => {
    const agent = await login();
    const { steps } = await eventBySlug(agent, 'death');
    const s5 = steps[4] as AdminStepRow;
    const res = (await agent.get(`/admin/steps/${s5.id}`)).body;
    expect(res.event).toMatchObject({ slug: 'death' });
    expect(res.siblings).toHaveLength(6);
    expect(res.siblings[4]).toMatchObject({
      id: s5.id,
      needs: expect.arrayContaining([(steps[2] as AdminStepRow).id, (steps[3] as AdminStepRow).id]),
    });
  });
});

describe('admin: dependencies cannot form a cycle', () => {
  async function death() {
    const agent = await login();
    const { steps } = await eventBySlug(agent, 'death');
    return { agent, s: steps };
  }

  it('blocks a two-step loop with a clear message, and saves nothing', async () => {
    const { agent, s } = await death();
    const [s1, s2] = s as [AdminStepRow, AdminStepRow];
    // s2 already needs s1. Making s1 need s2 would loop.
    const res = await agent
      .put(`/admin/steps/${s1.id}/dependencies`)
      .send({ needs: [s2.id], ...prov });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('dependency_cycle');
    expect(res.body.error.message).toContain('Not saved: this would create a loop.');
    expect(res.body.error.message).toContain(
      `"${s1.title}" needs "${s2.title}", which needs "${s1.title}".`,
    );
    expect(res.body.error.details.cycle).toEqual([s1.id, s2.id, s1.id]);
    expect(res.body.error.details.titles).toEqual([s1.title, s2.title, s1.title]);
    const after = (await agent.get(`/admin/steps/${s1.id}`)).body.step as AdminStepRow;
    expect(after.needs).toEqual([]);
    expect(after.lastVerifiedAt).toBeNull(); // a refused edit does not even stamp the step
  });

  it('blocks a longer loop added one dependency at a time', async () => {
    const { agent, s } = await death();
    const [, s2, , s4] = s as [AdminStepRow, AdminStepRow, AdminStepRow, AdminStepRow];
    // s4 needs s3 needs s2 (via the seed). Adding "s2 needs s4" closes a 3-step loop.
    const res = await agent
      .post(`/admin/steps/${s2.id}/dependencies`)
      .send({ dependsOnId: s4.id, ...prov });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('dependency_cycle');
    expect(res.body.error.details.cycle).toHaveLength(4);
    expect(res.body.error.details.cycle[0]).toBe(res.body.error.details.cycle[3]);
    expect(res.body.error.message).toMatch(/which needs/);
  });

  it('blocks a step that needs itself', async () => {
    const { agent, s } = await death();
    const s3 = s[2] as AdminStepRow;
    const res = await agent
      .post(`/admin/steps/${s3.id}/dependencies`)
      .send({ dependsOnId: s3.id, ...prov });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('dependency_cycle');
    expect(res.body.error.message).toContain('cannot need itself');
  });

  it('blocks a loop created through a general step edit too', async () => {
    const { agent, s } = await death();
    const [s1, , , , s5] = s as [
      AdminStepRow,
      AdminStepRow,
      AdminStepRow,
      AdminStepRow,
      AdminStepRow,
    ];
    const res = await agent
      .patch(`/admin/steps/${s1.id}`)
      .send({ title: 'Renamed', needs: [s5.id], ...prov });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('dependency_cycle');
    const after = (await agent.get(`/admin/steps/${s1.id}`)).body.step as AdminStepRow;
    expect(after.title).toBe(s1.title); // the rename was rolled back with it
  });

  it('allows a valid new dependency and a valid removal', async () => {
    const { agent, s } = await death();
    const [, , , , s5, s6] = s as [
      AdminStepRow,
      AdminStepRow,
      AdminStepRow,
      AdminStepRow,
      AdminStepRow,
      AdminStepRow,
    ];
    const add = await agent
      .post(`/admin/steps/${s6.id}/dependencies`)
      .send({ dependsOnId: s5.id, ...prov });
    expect(add.status).toBe(201);
    expect(add.body.step.needs.map((n: { id: string }) => n.id)).toContain(s5.id);
    const remove = await agent.delete(`/admin/steps/${s6.id}/dependencies/${s5.id}`).send(prov);
    expect(remove.status).toBe(200);
    expect(remove.body.step.needs.map((n: { id: string }) => n.id)).not.toContain(s5.id);
    expect(remove.body.step.lastVerifiedAt).toBe(FIXED_NOW.toISOString());
  });

  it('asks for a source when changing a dependency', async () => {
    const { agent, s } = await death();
    const [s1, s2] = s as [AdminStepRow, AdminStepRow];
    expect((await agent.put(`/admin/steps/${s1.id}/dependencies`).send({ needs: [] })).status).toBe(
      400,
    );
    expect(
      (await agent.post(`/admin/steps/${s1.id}/dependencies`).send({ dependsOnId: s2.id })).status,
    ).toBe(400);
    expect(
      (await agent.delete(`/admin/steps/${s2.id}/dependencies/${s1.id}`).send({})).status,
    ).toBe(400);
  });

  it('404s when removing a dependency that is not there', async () => {
    const { agent, s } = await death();
    const [s1, , s3] = s as [AdminStepRow, AdminStepRow, AdminStepRow];
    expect(
      (await agent.delete(`/admin/steps/${s1.id}/dependencies/${s3.id}`).send(prov)).status,
    ).toBe(404);
  });

  it('refuses a dependency on a step of another situation', async () => {
    const { agent, s } = await death();
    const move = await eventBySlug(agent, 'move');
    const res = await agent
      .post(`/admin/steps/${(s[0] as AdminStepRow).id}/dependencies`)
      .send({ dependsOnId: (move.steps[0] as AdminStepRow).id, ...prov });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('unknown_step');
  });

  it('keeps public order intact after a valid reorder of dependencies', async () => {
    const { agent, s } = await death();
    const [, , s3, , , s6] = s as [
      AdminStepRow,
      AdminStepRow,
      AdminStepRow,
      AdminStepRow,
      AdminStepRow,
      AdminStepRow,
    ];
    // Let the PF claim wait only for the certified copies (drop the heir certificate): breaks its document.
    const res = await agent
      .put(`/admin/steps/${s6.id}/dependencies`)
      .send({ needs: [s3.id], ...prov });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('document_not_upstream');
  });
});

describe('admin: step documents', () => {
  it('refuses a document that comes from a step the step does not wait for', async () => {
    const agent = await login();
    const { steps } = await eventBySlug(agent, 'death');
    const [s1, , s3, s4] = steps as [AdminStepRow, AdminStepRow, AdminStepRow, AdminStepRow];
    const docs = ((await agent.get('/admin/documents')).body as { documents: AdminDocumentRow[] })
      .documents;
    const heir = docs.find((d) => d.name === 'Legal heir certificate') as AdminDocumentRow;
    // s3 asking for the heir certificate "from s4" is backwards: s4 comes after s3.
    const res = await agent.put(`/admin/steps/${s3.id}/documents`).send({
      rows: [{ documentId: heir.id, role: 'REQUIRES', producedByStepId: s4.id }],
      ...prov,
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('document_not_upstream');
    expect(res.body.error.message).toContain('Legal heir certificate');
    // Unchanged:
    const after = (await agent.get(`/admin/steps/${s3.id}`)).body.step as AdminStepRow;
    expect(after.documents.filter((d) => d.role === 'REQUIRES').map((d) => d.documentName)).toEqual(
      ['Registration number', 'ID of the applicant'],
    );
    expect(s1.id).toBeTruthy();
  });

  it('refuses to make a step produce a document that an earlier step already needs', async () => {
    const agent = await login();
    const { steps } = await eventBySlug(agent, 'death');
    const s2 = steps[1] as AdminStepRow;
    const docs = ((await agent.get('/admin/documents')).body as { documents: AdminDocumentRow[] })
      .documents;
    // Step 1 asks the user for this ID. If step 2 produced it, step 1 could never be finished.
    const idDoc = docs.find((d) => d.name === 'ID of the person who died') as AdminDocumentRow;
    const res = await agent
      .put(`/admin/steps/${s2.id}/documents`)
      .send({ rows: [{ documentId: idDoc.id, role: 'PRODUCES' }], ...prov });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('document_not_upstream');
    expect(res.body.error.message).toContain('Get the medical certificate of cause of death');
  });

  it('replaces the document rows and keeps wording overrides', async () => {
    const agent = await login();
    const { steps } = await eventBySlug(agent, 'death');
    const [s1, s2] = steps as [AdminStepRow, AdminStepRow];
    const docs = ((await agent.get('/admin/documents')).body as { documents: AdminDocumentRow[] })
      .documents;
    const medical = docs.find(
      (d) => d.name === 'Medical certificate of cause of death',
    ) as AdminDocumentRow;
    const idDoc = docs.find((d) => d.name === 'ID of the person who died') as AdminDocumentRow;
    const cheque = docs.find(
      (d) => d.name === 'Cancelled cheque of the claimant',
    ) as AdminDocumentRow;
    const res = await agent.put(`/admin/steps/${s2.id}/documents`).send({
      rows: [
        {
          documentId: medical.id,
          role: 'REQUIRES',
          producedByStepId: s1.id,
          label: "The doctor's certificate",
        },
        { documentId: idDoc.id, role: 'REQUIRES' },
        { documentId: cheque.id, role: 'PRODUCES' },
      ],
      ...prov,
    });
    expect(res.status).toBe(200);
    expect(res.body.step.documents).toEqual([
      expect.objectContaining({
        documentName: 'Medical certificate of cause of death',
        label: "The doctor's certificate",
        producedByStepId: s1.id,
        role: 'REQUIRES',
      }),
      expect.objectContaining({
        documentName: 'ID of the person who died',
        role: 'REQUIRES',
        producedByStepId: null,
      }),
      expect.objectContaining({
        documentName: 'Cancelled cheque of the claimant',
        role: 'PRODUCES',
      }),
    ]);
  });

  it('rejects duplicates, "comes from" on a produced document, and unknown references', async () => {
    const agent = await login();
    const { steps } = await eventBySlug(agent, 'death');
    const [s1, s2] = steps as [AdminStepRow, AdminStepRow];
    const docs = ((await agent.get('/admin/documents')).body as { documents: AdminDocumentRow[] })
      .documents;
    const d = (docs[0] as AdminDocumentRow).id;
    const put = (rows: unknown[]) =>
      agent.put(`/admin/steps/${s2.id}/documents`).send({ rows, ...prov });
    expect(
      (
        await put([
          { documentId: d, role: 'REQUIRES' },
          { documentId: d, role: 'REQUIRES' },
        ])
      ).body.error.code,
    ).toBe('duplicate_document');
    expect(
      (await put([{ documentId: d, role: 'PRODUCES', producedByStepId: s1.id }])).body.error.code,
    ).toBe('invalid_document_row');
    expect((await put([{ documentId: 'nope', role: 'REQUIRES' }])).body.error.code).toBe(
      'unknown_document',
    );
    expect(
      (await put([{ documentId: d, role: 'REQUIRES', producedByStepId: 'nope' }])).body.error.code,
    ).toBe('unknown_step');
  });

  it("removing a step's producer rows leaves the document for the user to tick", async () => {
    const agent = await login();
    const { steps } = await eventBySlug(agent, 'death');
    const s2 = steps[1] as AdminStepRow;
    const res = await agent.put(`/admin/steps/${s2.id}/documents`).send({ rows: [], ...prov });
    expect(res.body.step.documents).toEqual([]);
  });
});

describe('admin: document catalog', () => {
  it('lists documents with how many steps use them', async () => {
    const agent = await login();
    const { documents } = (await agent.get('/admin/documents')).body as {
      documents: AdminDocumentRow[];
    };
    const cert = documents.find((d) => d.name === 'Certified death certificate');
    expect(cert?.stepCount).toBeGreaterThanOrEqual(4); // produced once, required by three steps
    expect(documents.every((d) => !d.verified && d.stale)).toBe(true);
  });

  it('creates, edits and deletes an unused document, each time asking for a source', async () => {
    const agent = await login();
    expect((await agent.post('/admin/documents').send({ name: 'No source' })).status).toBe(400);
    const created = await agent
      .post('/admin/documents')
      .send({ name: 'Ration card', description: 'Original', ...prov });
    expect(created.status).toBe(201);
    expect(created.body.document).toMatchObject({
      name: 'Ration card',
      lastVerifiedAt: FIXED_NOW.toISOString(),
      stepCount: 0,
    });
    const id = created.body.document.id as string;
    const patched = await agent
      .patch(`/admin/documents/${id}`)
      .send({ description: null, ...prov });
    expect(patched.body.document.description).toBeNull();
    expect((await agent.delete(`/admin/documents/${id}`)).status).toBe(204);
    expect((await agent.delete(`/admin/documents/${id}`)).status).toBe(404);
  });

  it('refuses a duplicate name and deleting a document that steps use', async () => {
    const agent = await login();
    const dup = await agent.post('/admin/documents').send({ name: 'Registration number', ...prov });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('name_taken');
    const docs = ((await agent.get('/admin/documents')).body as { documents: AdminDocumentRow[] })
      .documents;
    const used = docs.find((d) => d.name === 'Registration number') as AdminDocumentRow;
    const del = await agent.delete(`/admin/documents/${used.id}`);
    expect(del.status).toBe(409);
    expect(del.body.error.code).toBe('document_in_use');
    const rename = await agent
      .patch(`/admin/documents/${used.id}`)
      .send({ name: 'ID of the applicant', ...prov });
    expect(rename.status).toBe(409);
  });
});

describe('admin: offices', () => {
  it('lists, creates, edits and deletes offices with a source on every edit', async () => {
    const agent = await login();
    const list = ((await agent.get('/admin/offices')).body as { offices: AdminOfficeRow[] })
      .offices;
    expect(list.length).toBeGreaterThan(10);
    expect(list.every((o) => !o.verified)).toBe(true);

    expect((await agent.post('/admin/offices').send({ name: 'No source' })).status).toBe(400);
    const created = await agent.post('/admin/offices').send({
      name: 'Jayanagar ward office',
      address: '4th Block',
      url: 'https://bbmp.gov.in/',
      hours: '10 am to 5 pm',
      ...prov,
    });
    expect(created.status).toBe(201);
    expect(created.body.office).toMatchObject({
      kind: 'OFFICE',
      city: 'Bengaluru',
      stepCount: 0,
      url: 'https://bbmp.gov.in/',
    });

    const id = created.body.office.id as string;
    const patched = await agent
      .patch(`/admin/offices/${id}`)
      .send({ kind: 'PORTAL', ...prov, verified: true });
    expect(patched.body.office).toMatchObject({ kind: 'PORTAL', verified: true, stale: false });

    expect((await agent.delete(`/admin/offices/${id}`)).status).toBe(204);
  });

  it('only accepts http(s) website addresses', async () => {
    const agent = await login();
    for (const url of ['javascript:alert(1)', 'ftp://x.org', 'nope']) {
      const res = await agent.post('/admin/offices').send({ name: 'Bad site', url, ...prov });
      expect(res.status, url).toBe(400);
    }
  });

  it('refuses a duplicate name in the same city, allows it in another', async () => {
    const agent = await login();
    expect(
      (await agent.post('/admin/offices').send({ name: 'Aadhaar Seva Kendra', ...prov })).status,
    ).toBe(409);
    expect(
      (
        await agent
          .post('/admin/offices')
          .send({ name: 'Aadhaar Seva Kendra', city: 'Mysuru', ...prov })
      ).status,
    ).toBe(201);
  });

  it('deleting an office that steps use clears their link and keeps their wording', async () => {
    const agent = await login();
    const offices = ((await agent.get('/admin/offices')).body as { offices: AdminOfficeRow[] })
      .offices;
    const ward = offices.find((o) => o.name === 'Ward health office') as AdminOfficeRow;
    expect(ward.stepCount).toBe(2);
    expect((await agent.delete(`/admin/offices/${ward.id}`)).status).toBe(204);
    const { steps } = await eventBySlug(agent, 'death');
    const s2 = steps[1] as AdminStepRow;
    expect(s2.officeId).toBeNull();
    expect(s2.whereText).toBe("Ward health office or the state's online civil registration portal");
  });
});
