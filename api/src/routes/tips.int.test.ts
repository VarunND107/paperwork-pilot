import request from 'supertest';
import type TestAgent from 'supertest/lib/agent.js';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { AdminTipList, AdminTipRow } from '../admin/types.js';
import { seedDatabase } from '../seed/seed.js';
import type { RouteResponse, StepView } from '../services/types.js';
import { MAX_PENDING_PER_TARGET } from '../tips/service.js';
import { createTestApp, FIXED_NOW, TEST_ADMIN_PASSWORD } from '../test/appKit.js';
import { resetDatabase } from '../test/db.js';

const t = createTestApp();
/** A fresh app each time: the limiter counts per app, and both tip routes share it. */
const limitedApp = () => createTestApp({ prisma: t.prisma, rateLimits: { tips: 3 } }).app;
const TIP = 'Ask for the acknowledgement slip before you leave the counter.';
const VOTER = '3f9c1e2a-77b4-4d0e-9a51-0c2f7d6b8e11';

beforeEach(async () => {
  await resetDatabase(t.prisma);
  await seedDatabase(t.prisma);
  t.setNow(FIXED_NOW);
});
afterAll(async () => {
  await t.close();
});

async function steps(slug = 'death'): Promise<StepView[]> {
  return ((await request(t.app).get(`/events/${slug}/route`)).body as RouteResponse).steps;
}

/** A step that has an office, so both a step tip and an office tip can be tried. */
async function stepWithOffice() {
  const step = (await steps()).find((s) => s.office !== null);
  if (!step?.office) throw new Error('no step with an office');
  return { step, office: step.office };
}

async function adminAgent(): Promise<TestAgent> {
  const agent = request.agent(t.app);
  await agent.post('/admin/login').send({ password: TEST_ADMIN_PASSWORD }).expect(200);
  return agent;
}

async function submit(body: Record<string, unknown>) {
  return request(t.app).post('/tips').send(body);
}

async function approve(id: string) {
  const agent = await adminAgent();
  const res = await agent.patch(`/admin/tips/${id}`).send({ status: 'APPROVED' });
  expect(res.status).toBe(200);
}

describe('POST /tips', () => {
  it('stores a tip about a step as pending, so it is not public yet', async () => {
    const { step } = await stepWithOffice();
    const res = await submit({ stepId: step.id, body: TIP });
    expect(res.status).toBe(201);
    expect(res.body.tip.status).toBe('PENDING');

    const row = await t.prisma.tip.findUniqueOrThrow({ where: { id: res.body.tip.id } });
    expect(row).toMatchObject({
      stepId: step.id,
      officeId: null,
      origin: 'USER',
      status: 'PENDING',
    });

    const after = (await steps()).find((s) => s.id === step.id);
    expect(after?.tips.map((x) => x.body)).not.toContain(TIP);
  });

  it('stores a tip about an office', async () => {
    const { office } = await stepWithOffice();
    const res = await submit({ officeId: office.id, body: TIP });
    expect(res.status).toBe(201);
    const row = await t.prisma.tip.findUniqueOrThrow({ where: { id: res.body.tip.id } });
    expect(row).toMatchObject({ officeId: office.id, stepId: null, status: 'PENDING' });
  });

  it('cleans up the text it stores', async () => {
    const { step } = await stepWithOffice();
    const res = await submit({ stepId: step.id, body: '  Take the  original\n and a copy.  ' });
    const row = await t.prisma.tip.findUniqueOrThrow({ where: { id: res.body.tip.id } });
    expect(row.body).toBe('Take the original and a copy.');
  });

  it('accepts ordinary advice with numbers in it', async () => {
    const { step } = await stepWithOffice();
    const res = await submit({
      stepId: step.id,
      body: 'Bring 2 photocopies. Fee was Rs 50 on Tuesday.',
    });
    expect(res.status).toBe(201);
  });

  it('answers 404 for a step or office that does not exist', async () => {
    expect((await submit({ stepId: 'nope', body: TIP })).status).toBe(404);
    expect((await submit({ officeId: 'nope', body: TIP })).status).toBe(404);
  });

  it.each([
    ['no target', () => ({ body: TIP })],
    ['both targets', (s: string, o: string) => ({ stepId: s, officeId: o, body: TIP })],
    ['too short', (s: string) => ({ stepId: s, body: 'Short' })],
    ['too long', (s: string) => ({ stepId: s, body: 'x'.repeat(401) })],
    ['a link', (s: string) => ({ stepId: s, body: 'See https://example.com for the form' })],
    [
      'a bare domain',
      (s: string) => ({ stepId: s, body: 'The portal bescom.co.in is slow today' }),
    ],
    ['an email', (s: string) => ({ stepId: s, body: 'Write to ravi@example.org for help' })],
    ['a phone number', (s: string) => ({ stepId: s, body: 'Call 98450 12345 and ask for her' })],
    ['a status', (s: string) => ({ stepId: s, body: TIP, status: 'APPROVED' })],
    ['a non-string body', (s: string) => ({ stepId: s, body: 12345678901 })],
  ])('refuses %s with a validation error and stores nothing', async (_name, make) => {
    const { step, office } = await stepWithOffice();
    const res = await submit(make(step.id, office.id));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_error');
    expect(await t.prisma.tip.count({ where: { origin: 'USER' } })).toBe(0);
  });

  it('says what is wrong with a link', async () => {
    const { step } = await stepWithOffice();
    const res = await submit({ stepId: step.id, body: 'See https://example.com for the form' });
    expect(JSON.stringify(res.body.error.details)).toContain('cannot contain links');
  });

  it('stops taking tips for a step once too many are waiting', async () => {
    const { step } = await stepWithOffice();
    await t.prisma.tip.createMany({
      data: Array.from({ length: MAX_PENDING_PER_TARGET }, (_, i) => ({
        stepId: step.id,
        body: `Waiting tip number ${i} for review`,
        status: 'PENDING' as const,
        origin: 'USER' as const,
      })),
    });
    const res = await submit({ stepId: step.id, body: TIP });
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('tips_queue_full');
    // Another step is unaffected.
    const other = (await steps()).find((s) => s.id !== step.id);
    expect((await submit({ stepId: other?.id, body: TIP })).status).toBe(201);
  });

  it('is rate limited per visitor address', async () => {
    const { step } = await stepWithOffice();
    const app = limitedApp();
    const codes: number[] = [];
    for (let i = 0; i < 5; i++) {
      codes.push((await request(app).post('/tips').send({ stepId: step.id, body: TIP })).status);
    }
    expect(codes).toEqual([201, 201, 201, 429, 429]);
  });
});

describe('tips on a route', () => {
  it('shows an approved visitor tip with its date and no author', async () => {
    const { step } = await stepWithOffice();
    const id = (await submit({ stepId: step.id, body: TIP })).body.tip.id as string;
    await approve(id);

    const shown = (await steps()).find((s) => s.id === step.id)?.tips.find((x) => x.id === id);
    expect(shown).toEqual({
      id,
      scope: 'step',
      body: TIP,
      origin: 'USER',
      createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      staleFlags: 0,
    });
  });

  it('shows an office tip on every step that goes to that office', async () => {
    const all = await steps('death');
    const { office } = await stepWithOffice();
    const sameOffice = all.filter((s) => s.office?.id === office.id);
    const id = (await submit({ officeId: office.id, body: TIP })).body.tip.id as string;
    await approve(id);

    const after = await steps('death');
    for (const s of after.filter((x) => x.office?.id === office.id)) {
      expect(s.tips.find((x) => x.id === id)).toMatchObject({ scope: 'office', body: TIP });
    }
    for (const s of after.filter((x) => x.office?.id !== office.id)) {
      expect(s.tips.map((x) => x.id)).not.toContain(id);
    }
    expect(sameOffice.length).toBeGreaterThan(0);
  });

  it('puts the newest tips first and shows at most five', async () => {
    const { step } = await stepWithOffice();
    await t.prisma.tip.createMany({
      data: Array.from({ length: 7 }, (_, i) => ({
        stepId: step.id,
        body: `Approved tip number ${i} from a visitor`,
        status: 'APPROVED' as const,
        origin: 'USER' as const,
        // Later than the seeded sample tip, which is stamped when the database was seeded.
        createdAt: new Date(Date.now() + (i + 1) * 60_000),
      })),
    });
    const shown = (await steps()).find((s) => s.id === step.id)?.tips ?? [];
    expect(shown).toHaveLength(5);
    expect(shown[0]?.body).toBe('Approved tip number 6 from a visitor');
  });

  it('never shows a rejected or pending tip', async () => {
    const { step } = await stepWithOffice();
    await t.prisma.tip.createMany({
      data: (['PENDING', 'REJECTED'] as const).map((status) => ({
        stepId: step.id,
        body: `A ${status.toLowerCase()} tip nobody should see`,
        status,
        origin: 'USER' as const,
      })),
    });
    const bodies = (await steps()).find((s) => s.id === step.id)?.tips.map((x) => x.body) ?? [];
    expect(bodies.join(' ')).not.toMatch(/nobody should see/);
  });
});

describe('POST /tips/:id/flag-stale', () => {
  async function approvedTip(): Promise<string> {
    const { step } = await stepWithOffice();
    const id = (await submit({ stepId: step.id, body: TIP })).body.tip.id as string;
    await approve(id);
    return id;
  }
  const flag = (id: string, voter: string | undefined = VOTER) =>
    request(t.app)
      .post(`/tips/${id}/flag-stale`)
      .set(voter ? { 'X-Voter-Id': voter } : {});

  it('counts one flag per browser, however many times it is pressed', async () => {
    const id = await approvedTip();
    expect((await flag(id)).body).toEqual({ tip: { id, staleFlags: 1 } });
    expect((await flag(id)).body).toEqual({ tip: { id, staleFlags: 1 } });
    expect((await flag(id, 'another-browser-0123456789')).body.tip.staleFlags).toBe(2);
  });

  it('shows the count on the route', async () => {
    const id = await approvedTip();
    await flag(id);
    await flag(id, 'another-browser-0123456789');
    const shown = (await steps()).flatMap((s) => s.tips).find((x) => x.id === id);
    expect(shown?.staleFlags).toBe(2);
  });

  it('keeps only a hash of the browser id', async () => {
    const id = await approvedTip();
    await flag(id);
    const rows = await t.prisma.tipFlag.findMany({ where: { tipId: id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.voterHash).not.toContain(VOTER);
  });

  it('needs a browser id', async () => {
    const id = await approvedTip();
    const none = await flag(id, '');
    expect(none.status).toBe(400);
    expect(none.body.error.code).toBe('voter_required');
    expect((await flag(id, 'bad id!')).status).toBe(400);
  });

  it('cannot flag a tip that is not public', async () => {
    const { step } = await stepWithOffice();
    const pending = (await submit({ stepId: step.id, body: TIP })).body.tip.id as string;
    expect((await flag(pending)).status).toBe(404);
    expect((await flag('missing')).status).toBe(404);
    expect(await t.prisma.tipFlag.count()).toBe(0);
  });

  it('is rate limited', async () => {
    const id = await approvedTip();
    const app = limitedApp();
    const codes: number[] = [];
    for (let i = 0; i < 5; i++) {
      codes.push(
        (
          await request(app)
            .post(`/tips/${id}/flag-stale`)
            .set({ 'X-Voter-Id': `${VOTER}${i}` })
        ).status,
      );
    }
    expect(codes).toEqual([200, 200, 200, 429, 429]);
  });
});

describe('admin: moderation queue', () => {
  async function pendingTip(body = TIP) {
    const { step } = await stepWithOffice();
    return (await submit({ stepId: step.id, body })).body.tip.id as string;
  }
  const list = async (agent: TestAgent, filter?: string) =>
    (await agent.get('/admin/tips').query(filter ? { filter } : {})).body as AdminTipList;

  it('needs a session', async () => {
    expect((await request(t.app).get('/admin/tips')).status).toBe(401);
    expect((await request(t.app).patch('/admin/tips/x').send({ status: 'APPROVED' })).status).toBe(
      401,
    );
    expect((await request(t.app).delete('/admin/tips/x')).status).toBe(401);
  });

  it('lists pending tips oldest first with what they are about, and counts the queue', async () => {
    const agent = await adminAgent();
    const first = await pendingTip('The first tip written about this step');
    t.setNow(new Date(FIXED_NOW.getTime() + 1000));
    await pendingTip('The second tip written about this step');
    const { tips, counts } = await list(agent);
    expect(counts).toEqual({ pending: 2, flagged: 0 });
    expect(tips.map((x) => x.body)).toEqual([
      'The first tip written about this step',
      'The second tip written about this step',
    ]);
    expect(tips[0]).toMatchObject({
      id: first,
      status: 'PENDING',
      origin: 'USER',
      flagCount: 0,
      target: { kind: 'step', context: 'A parent has passed away' },
    });
  });

  it('describes an office tip by the office and its city', async () => {
    const agent = await adminAgent();
    const { office } = await stepWithOffice();
    await submit({ officeId: office.id, body: TIP });
    const { tips } = await list(agent, 'pending');
    expect(tips[0]?.target).toEqual({
      kind: 'office',
      id: office.id,
      label: office.name,
      context: 'Bengaluru',
    });
  });

  it('approves a tip, which stamps when and makes it public', async () => {
    const agent = await adminAgent();
    const id = await pendingTip();
    const res = await agent.patch(`/admin/tips/${id}`).send({ status: 'APPROVED' });
    expect(res.status).toBe(200);
    expect((res.body.tip as AdminTipRow).status).toBe('APPROVED');
    expect((res.body.tip as AdminTipRow).moderatedAt).toBe(FIXED_NOW.toISOString());
    expect((await steps()).flatMap((s) => s.tips).map((x) => x.id)).toContain(id);
    expect((await list(agent)).counts.pending).toBe(0);
  });

  it('rejects a tip, which keeps it hidden but on record', async () => {
    const agent = await adminAgent();
    const id = await pendingTip();
    await agent.patch(`/admin/tips/${id}`).send({ status: 'REJECTED' }).expect(200);
    expect((await steps()).flatMap((s) => s.tips).map((x) => x.id)).not.toContain(id);
    expect((await list(agent, 'rejected')).tips.map((x) => x.id)).toEqual([id]);
    expect((await list(agent)).tips).toEqual([]);
  });

  it('lets a moderator reword a tip, under the same rules as visitors', async () => {
    const agent = await adminAgent();
    const { step } = await stepWithOffice();
    const { id } = await t.prisma.tip.create({
      data: { stepId: step.id, body: 'Call Ravi on 98450 12345 to skip the queue', origin: 'USER' },
    });
    const bad = await agent
      .patch(`/admin/tips/${id}`)
      .send({ body: 'See https://example.com now' });
    expect(bad.status).toBe(400);
    const ok = await agent
      .patch(`/admin/tips/${id}`)
      .send({ body: 'Ask a clerk how to skip the queue', status: 'APPROVED' });
    expect(ok.status).toBe(200);
    expect((ok.body.tip as AdminTipRow).body).toBe('Ask a clerk how to skip the queue');
  });

  it('puts a flagged tip back in the queue until a moderator clears the flags', async () => {
    const agent = await adminAgent();
    const id = await pendingTip();
    await approve(id);
    await request(t.app).post(`/tips/${id}/flag-stale`).set({ 'X-Voter-Id': VOTER });
    await request(t.app)
      .post(`/tips/${id}/flag-stale`)
      .set({ 'X-Voter-Id': `${VOTER}-2` });

    const queue = await list(agent);
    expect(queue.counts).toEqual({ pending: 0, flagged: 1 });
    expect(queue.tips[0]).toMatchObject({ id, status: 'APPROVED', flagCount: 2 });
    expect((await list(agent, 'flagged')).tips).toHaveLength(1);

    const cleared = await agent.patch(`/admin/tips/${id}`).send({ clearFlags: true });
    expect(cleared.status).toBe(200);
    expect((cleared.body.tip as AdminTipRow).flagCount).toBe(0);
    expect((await list(agent)).counts.flagged).toBe(0);
    // Cleared flags let the same browser vote again.
    const again = await request(t.app).post(`/tips/${id}/flag-stale`).set({ 'X-Voter-Id': VOTER });
    expect(again.body.tip.staleFlags).toBe(1);
  });

  it('takes a flagged tip down by rejecting it', async () => {
    const agent = await adminAgent();
    const id = await pendingTip();
    await approve(id);
    await request(t.app).post(`/tips/${id}/flag-stale`).set({ 'X-Voter-Id': VOTER });
    await agent.patch(`/admin/tips/${id}`).send({ status: 'REJECTED' }).expect(200);
    expect((await steps()).flatMap((s) => s.tips).map((x) => x.id)).not.toContain(id);
    expect((await list(agent)).counts).toEqual({ pending: 0, flagged: 0 });
  });

  it('deletes a tip and its flags', async () => {
    const agent = await adminAgent();
    const id = await pendingTip();
    await approve(id);
    await request(t.app).post(`/tips/${id}/flag-stale`).set({ 'X-Voter-Id': VOTER });
    expect((await agent.delete(`/admin/tips/${id}`)).status).toBe(204);
    expect(await t.prisma.tip.count({ where: { id } })).toBe(0);
    expect(await t.prisma.tipFlag.count()).toBe(0);
    expect((await agent.delete(`/admin/tips/${id}`)).status).toBe(404);
  });

  it('answers 404 for a tip that is not there, and 400 for an empty or odd change', async () => {
    const agent = await adminAgent();
    expect((await agent.patch('/admin/tips/missing').send({ status: 'APPROVED' })).status).toBe(
      404,
    );
    const id = await pendingTip();
    expect((await agent.patch(`/admin/tips/${id}`).send({})).status).toBe(400);
    expect((await agent.patch(`/admin/tips/${id}`).send({ status: 'PENDING' })).status).toBe(400);
    expect((await agent.get('/admin/tips').query({ filter: 'bogus' })).status).toBe(400);
  });

  it('lists approved sample tips only under approved and all', async () => {
    const agent = await adminAgent();
    const approved = await list(agent, 'approved');
    expect(approved.tips.length).toBeGreaterThan(0);
    expect(approved.tips.every((x) => x.origin === 'SEED')).toBe(true);
    expect((await list(agent)).tips).toEqual([]);
    expect((await list(agent, 'all')).tips.length).toBe(approved.tips.length);
  });

  it('refuses a write that comes from another site', async () => {
    const agent = await adminAgent();
    const id = await pendingTip();
    const res = await agent
      .patch(`/admin/tips/${id}`)
      .set('Origin', 'https://evil.example')
      .send({ status: 'APPROVED' });
    expect(res.status).toBe(403);
  });
});
