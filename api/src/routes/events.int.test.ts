import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedDatabase } from '../seed/seed.js';
import { createTestApp } from '../test/appKit.js';
import { resetDatabase } from '../test/db.js';
import type { EventSummary, RouteResponse } from '../services/types.js';
import type { MatchResponse } from './match.js';

const t = createTestApp();

beforeAll(async () => {
  await resetDatabase(t.prisma);
  await seedDatabase(t.prisma);
});
afterAll(async () => {
  await t.close();
});

describe('GET /events', () => {
  it('lists the three situations in order, flagged as sample data', async () => {
    const res = await request(t.app).get('/events');
    expect(res.status).toBe(200);
    const events = (res.body as { events: EventSummary[] }).events;
    expect(events.map((e) => e.slug)).toEqual(['death', 'move', 'biz']);
    expect(events[0]).toMatchObject({
      label: 'A parent has passed away',
      place: 'Bengaluru, Karnataka',
      eventDateLabel: 'Date of death',
      stepCount: 6,
      isSample: true,
    });
    expect(events.every((e) => e.isSample)).toBe(true);
  });

  it('stops calling an event a sample once every step is verified', async () => {
    const event = await t.prisma.event.findUniqueOrThrow({ where: { slug: 'biz' } });
    await t.prisma.step.updateMany({ where: { eventId: event.id }, data: { verified: true } });
    try {
      const res = await request(t.app).get('/events');
      const biz = (res.body as { events: EventSummary[] }).events.find((e) => e.slug === 'biz');
      expect(biz?.isSample).toBe(false);
    } finally {
      await t.prisma.step.updateMany({ where: { eventId: event.id }, data: { verified: false } });
    }
  });
});

describe('GET /events/:id/route', () => {
  it('returns the ordered route with nothing done', async () => {
    const res = await request(t.app).get('/events/death/route');
    expect(res.status).toBe(200);
    const body = res.body as RouteResponse;
    expect(body.event.slug).toBe('death');
    expect(body.disclaimer).toBe('Guidance, not legal advice.');
    expect(body.today).toBe('2026-10-09');
    expect(body.steps.map((s) => s.number)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(body.steps.map((s) => s.title)).toEqual([
      'Get the medical certificate of cause of death',
      'Register the death',
      'Collect certified copies of the death certificate',
      'Get the legal heir certificate',
      'Settle bank accounts and insurance',
      'Claim PF and pension',
    ]);
    expect(body.steps.map((s) => s.status)).toEqual([
      'ready',
      'locked',
      'locked',
      'locked',
      'locked',
      'locked',
    ]);
    expect(body.steps[0]?.isNext).toBe(true);
  });

  it('shows form, office, fee, wait, deadline text, documents and a tip on every step', async () => {
    const res = await request(t.app).get('/events/death/route');
    const s2 = (res.body as RouteResponse).steps[1]!;
    expect(s2).toMatchObject({
      form: 'Form 2 (death report)',
      where: "Ward health office or the state's online civil registration portal",
      fee: 'Free within 21 days',
      wait: 'A few working days',
      due: 'Within 21 days',
      dueRule: { amount: 21, unit: 'DAY' },
      office: { name: 'Ward health office', kind: 'OFFICE' },
    });
    expect(s2.blockedBy).toEqual([
      { id: expect.any(String), number: 1, title: 'Get the medical certificate of cause of death' },
    ]);
    expect(s2.documents.map((d) => d.label)).toEqual([
      'Medical certificate of cause of death',
      'Aadhaar or other ID of the person who died',
      'ID and address proof of the person reporting',
    ]);
    expect(s2.documents[0]).toMatchObject({ state: 'wait', comesFrom: { number: 1 } });
    expect(s2.documents[1]).toMatchObject({ state: 'open', comesFrom: null });
    expect(s2.tips).toEqual([
      expect.objectContaining({
        body: 'Report within 21 days. After that, late fees and extra paperwork begin.',
        origin: 'SEED',
        createdAt: null,
      }),
    ]);
  });

  it('NEVER presents sample data as verified, and always gives a source', async () => {
    for (const slug of ['death', 'move', 'biz']) {
      const res = await request(t.app).get(`/events/${slug}/route`);
      for (const step of (res.body as RouteResponse).steps) {
        expect(step.verification.verified, `${slug} ${step.number}`).toBe(false);
        expect(step.verification.lastVerifiedAt).toBeNull();
        expect(step.verification.stale).toBe(true);
        expect(step.verification.sourceUrl).toMatch(/^https?:\/\//);
      }
    }
  });

  it('reports verified steps as verified, with their date, and flags old ones stale', async () => {
    const step = await t.prisma.step.findFirstOrThrow({ where: { title: 'Register the death' } });
    const fresh = new Date('2026-09-20T00:00:00Z');
    await t.prisma.step.update({
      where: { id: step.id },
      data: { verified: true, lastVerifiedAt: fresh },
    });
    try {
      let s2 = ((await request(t.app).get('/events/death/route')).body as RouteResponse).steps[1]!;
      expect(s2.verification).toMatchObject({
        verified: true,
        lastVerifiedAt: '2026-09-20T00:00:00.000Z',
        stale: false,
      });
      await t.prisma.step.update({
        where: { id: step.id },
        data: { lastVerifiedAt: new Date('2026-06-01T00:00:00Z') },
      });
      s2 = ((await request(t.app).get('/events/death/route')).body as RouteResponse).steps[1]!;
      expect(s2.verification.stale).toBe(true);
    } finally {
      await t.prisma.step.update({
        where: { id: step.id },
        data: { verified: false, lastVerifiedAt: null },
      });
    }
  });

  it('keeps the exact wording a step uses for a shared document', async () => {
    const res = await request(t.app).get('/events/move/route');
    const m4 = (res.body as RouteResponse).steps[3]!;
    expect(m4.documents[0]).toMatchObject({
      label: 'Address proof (rental agreement)',
      comesFrom: { number: 1 },
    });
  });

  it('accepts the event id as well as the slug', async () => {
    const event = await t.prisma.event.findUniqueOrThrow({ where: { slug: 'move' } });
    const res = await request(t.app).get(`/events/${event.id}/route`);
    expect(res.status).toBe(200);
    expect((res.body as RouteResponse).event.slug).toBe('move');
  });

  it('computes deadlines when given an event date', async () => {
    const res = await request(t.app).get('/events/death/route?eventDate=2026-10-01');
    const steps = (res.body as RouteResponse).steps;
    expect(steps[1]).toMatchObject({
      deadline: '2026-10-22',
      daysLeft: 13,
      deadlineState: 'upcoming',
    });
    expect(steps[0]).toMatchObject({ deadline: null, deadlineState: 'none' });
  });

  it('has no deadlines without an event date', async () => {
    const res = await request(t.app).get('/events/death/route');
    expect((res.body as RouteResponse).steps.every((s) => s.deadline === null)).toBe(true);
  });

  it('404s for an unknown situation and 400s for a bad date', async () => {
    expect((await request(t.app).get('/events/nope/route')).status).toBe(404);
    const bad = await request(t.app).get('/events/death/route?eventDate=2026-02-30');
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('validation_error');
  });
});

describe('POST /match', () => {
  const match = (text: unknown) => request(t.app).post('/match').send({ text });

  it.each([
    ['my father passed away', 'death'],
    ["I'm moving to Bengaluru with a toddler", 'move'],
    ["I'm starting a small business", 'biz'],
  ])('"%s" -> %s', async (text, slug) => {
    const res = await match(text);
    expect(res.status).toBe(200);
    const body = res.body as MatchResponse;
    expect(body.matched?.slug).toBe(slug);
    expect(body.candidates[0]?.score).toBeGreaterThanOrEqual(3);
    expect(body.suggestions).toEqual([]);
  });

  it('offers every situation when nothing matches', async () => {
    const body = (await match('what is the weather')).body as MatchResponse;
    expect(body.matched).toBeNull();
    expect(body.candidates).toEqual([]);
    expect(body.suggestions.map((e) => e.slug)).toEqual(['death', 'move', 'biz']);
  });

  it('uses the keywords stored on each event, so an admin can change them', async () => {
    const event = await t.prisma.event.findUniqueOrThrow({ where: { slug: 'biz' } });
    await t.prisma.event.update({
      where: { id: event.id },
      data: { keywords: [...event.keywords, 'pop-up cafe'] },
    });
    try {
      expect(((await match('planning a pop-up cafe')).body as MatchResponse).matched?.slug).toBe(
        'biz',
      );
    } finally {
      await t.prisma.event.update({ where: { id: event.id }, data: { keywords: event.keywords } });
    }
  });

  it('validates the body', async () => {
    for (const body of [
      {},
      { text: '' },
      { text: '   ' },
      { text: 'a'.repeat(301) },
      { text: 5 },
      { text: 'ok', extra: 1 },
    ]) {
      const res = await request(t.app).post('/match').send(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.error.code).toBe('validation_error');
    }
  });
});

describe('rate limiting', () => {
  it('answers 429 in the standard error shape once the limit is reached', async () => {
    const limited = createTestApp({ prisma: t.prisma, rateLimits: { match: 2 } });
    const send = () => request(limited.app).post('/match').send({ text: 'died' });
    expect((await send()).status).toBe(200);
    expect((await send()).status).toBe(200);
    const res = await send();
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('rate_limited');
  });
});
