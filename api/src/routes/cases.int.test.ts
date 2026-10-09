import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hashToken } from '../security/tokens.js';
import { seedDatabase } from '../seed/seed.js';
import type { CaseView, StepChanges } from '../services/types.js';
import {
  bearer,
  completeStep,
  createTestApp,
  fetchCase,
  FIXED_NOW,
  startCase,
  stepAt,
} from '../test/appKit.js';
import { resetDatabase } from '../test/db.js';

const t = createTestApp();

beforeAll(async () => {
  await resetDatabase(t.prisma);
  await seedDatabase(t.prisma);
});
beforeEach(async () => {
  await t.prisma.case.deleteMany();
  t.setNow(FIXED_NOW);
});
afterAll(async () => {
  await t.close();
});

interface StepResponse {
  case: CaseView;
  changes: StepChanges;
  unchanged: boolean;
}

const patchStep = (id: string, token: string, stepId: string, body: unknown) =>
  request(t.app)
    .patch(`/cases/${id}/steps/${stepId}`)
    .set(bearer(token))
    .send(body as object);
const patchDoc = (id: string, token: string, docId: string, body: unknown) =>
  request(t.app)
    .patch(`/cases/${id}/documents/${docId}`)
    .set(bearer(token))
    .send(body as object);

describe('POST /cases', () => {
  it('starts a case and hands back the secret token once', async () => {
    const res = await request(t.app).post('/cases').send({ eventId: 'death' });
    expect(res.status).toBe(201);
    expect(res.headers['cache-control']).toBe('no-store');
    const { token, case: view } = res.body as { token: string; case: CaseView };
    expect(token).toMatch(/^pp_case_/);
    expect(view.event.slug).toBe('death');
    expect(view.progress).toEqual({ done: 0, total: 6, nextStepId: view.steps[0]?.id });
    expect(view.eventDate).toBeNull();
    expect(view.remindersOptIn).toBe(false);
    expect(JSON.stringify(view)).not.toContain(token);
  });

  it('stores only a hash of the token', async () => {
    const c = await startCase(t.app, 'death');
    const row = await t.prisma.case.findUniqueOrThrow({ where: { id: c.id } });
    expect(row.tokenHash).toBe(hashToken(c.token));
    expect(row.tokenHash).not.toContain(c.token);
  });

  it('creates a pending row for every step', async () => {
    const c = await startCase(t.app, 'move');
    expect(await t.prisma.caseStep.count({ where: { caseId: c.id, status: 'PENDING' } })).toBe(6);
  });

  it('accepts an event date and computes deadlines from it', async () => {
    const c = await startCase(t.app, 'death', '2026-10-01');
    expect(c.view.eventDate).toBe('2026-10-01');
    expect(stepAt(c.view, 2)).toMatchObject({ deadline: '2026-10-22', daysLeft: 13 });
  });

  it('rejects an implausible or malformed event date', async () => {
    const old = await request(t.app)
      .post('/cases')
      .send({ eventId: 'death', eventDate: '1990-01-01' });
    expect(old.status).toBe(400);
    expect(old.body.error.code).toBe('invalid_event_date');
    const far = await request(t.app)
      .post('/cases')
      .send({ eventId: 'death', eventDate: '2040-01-01' });
    expect(far.body.error.code).toBe('invalid_event_date');
    const bad = await request(t.app)
      .post('/cases')
      .send({ eventId: 'death', eventDate: '01/10/2026' });
    expect(bad.body.error.code).toBe('validation_error');
  });

  it('404s for an unknown situation and 400s for a bad body', async () => {
    expect((await request(t.app).post('/cases').send({ eventId: 'nope' })).status).toBe(404);
    expect((await request(t.app).post('/cases').send({})).status).toBe(400);
    expect(
      (await request(t.app).post('/cases').send({ eventId: 'death', userId: 'x' })).status,
    ).toBe(400);
  });
});

describe('GET /cases/:id (access)', () => {
  it('needs the token', async () => {
    const c = await startCase(t.app, 'death');
    const none = await request(t.app).get(`/cases/${c.id}`);
    expect(none.status).toBe(401);
    expect(none.body.error.code).toBe('unauthorized');
  });

  it('says the same thing whether or not the case exists, when there is no token', async () => {
    const real = await startCase(t.app, 'death');
    const a = await request(t.app).get(`/cases/${real.id}`);
    const b = await request(t.app).get('/cases/does-not-exist');
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body).toEqual(b.body);
  });

  it("404s for a wrong token, another case's token, or an unknown case", async () => {
    const a = await startCase(t.app, 'death');
    const b = await startCase(t.app, 'death');
    expect((await request(t.app).get(`/cases/${a.id}`).set(bearer(b.token))).status).toBe(404);
    expect(
      (await request(t.app).get(`/cases/${a.id}`).set(bearer('pp_case_wrongwrongwrongwrongwrong')))
        .status,
    ).toBe(404);
    expect((await request(t.app).get('/cases/nope').set(bearer(a.token))).status).toBe(404);
  });

  it('returns the case to its owner', async () => {
    const c = await startCase(t.app, 'death');
    const res = await request(t.app).get(`/cases/${c.id}`).set(bearer(c.token));
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect((res.body as { case: CaseView }).case.id).toBe(c.id);
  });

  it('protects every case route, not just GET', async () => {
    const c = await startCase(t.app, 'death');
    const step = c.view.steps[0]!;
    const calls = [
      request(t.app).patch(`/cases/${c.id}`).send({ eventDate: '2026-10-01' }),
      request(t.app).patch(`/cases/${c.id}/steps/${step.id}`).send({ done: true }),
      request(t.app)
        .patch(`/cases/${c.id}/documents/${step.documents[0]!.documentId}`)
        .send({ ticked: true }),
      request(t.app).post(`/cases/${c.id}/reset`),
      request(t.app).delete(`/cases/${c.id}`),
    ];
    for (const res of await Promise.all(calls)) expect(res.status).toBe(401);
    expect(await t.prisma.case.count({ where: { id: c.id } })).toBe(1);
  });
});

describe('marking steps done', () => {
  it('will not mark a step done until its carried documents are ticked', async () => {
    const c = await startCase(t.app, 'death');
    const s1 = stepAt(c.view, 1);
    const res = await patchStep(c.id, c.token, s1.id, { done: true });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('documents_missing');
    expect(res.body.error.details.missing.map((m: { label: string }) => m.label)).toEqual([
      'Hospital discharge or death summary',
      'ID of the person who died',
    ]);
  });

  it('marks a step done once documents are ticked, unlocks the next, and auto-ticks produced documents', async () => {
    const c = await startCase(t.app, 'death');
    const s1 = stepAt(c.view, 1);
    for (const doc of s1.documents) {
      const tick = await patchDoc(c.id, c.token, doc.documentId, { ticked: true });
      expect(tick.status).toBe(200);
    }
    const res = await patchStep(c.id, c.token, s1.id, { done: true });
    expect(res.status).toBe(200);
    const body = res.body as StepResponse;
    expect(body.unchanged).toBe(false);
    expect(body.changes.unlocked).toEqual([stepAt(c.view, 2).id]);
    expect(body.changes.relocked).toEqual([]);
    expect(body.case.progress).toMatchObject({
      done: 1,
      total: 6,
      nextStepId: stepAt(c.view, 2).id,
    });
    const done = stepAt(body.case, 1);
    expect(done.status).toBe('done');
    expect(done.doneAt).toBe(FIXED_NOW.toISOString());
    const s2 = stepAt(body.case, 2);
    expect(s2.status).toBe('ready');
    expect(s2.isNext).toBe(true);
    expect(s2.documents[0]).toMatchObject({ state: 'auto', comesFrom: { number: 1 } });
    expect(s2.documents[1]?.state).toBe('open');
  });

  it('refuses a locked step and names what it waits for', async () => {
    const c = await startCase(t.app, 'death');
    const s5 = stepAt(c.view, 5);
    const res = await patchStep(c.id, c.token, s5.id, { done: true });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('step_locked');
    expect(res.body.error.details.blockedBy.map((b: { number: number }) => b.number)).toEqual([
      3, 4,
    ]);
    expect(await t.prisma.caseStep.count({ where: { caseId: c.id, status: 'DONE' } })).toBe(0);
  });

  it('is idempotent: marking a done step done again changes nothing', async () => {
    const c = await startCase(t.app, 'death');
    await completeStep(t.app, c, 1);
    const again = await patchStep(c.id, c.token, stepAt(c.view, 1).id, { done: true });
    expect(again.status).toBe(200);
    expect((again.body as StepResponse).unchanged).toBe(true);
    expect(await t.prisma.caseStep.count({ where: { caseId: c.id, status: 'DONE' } })).toBe(1);
  });

  it('does not move doneAt when marked done twice', async () => {
    const c = await startCase(t.app, 'death');
    await completeStep(t.app, c, 1);
    t.setNow(new Date('2026-10-10T06:00:00Z'));
    await patchStep(c.id, c.token, stepAt(c.view, 1).id, { done: true });
    const view = await fetchCase(t.app, c);
    expect(stepAt(view, 1).doneAt).toBe(FIXED_NOW.toISOString());
  });

  it('walks the whole death route to completion', async () => {
    const c = await startCase(t.app, 'death');
    let view = c.view;
    for (let n = 1; n <= 6; n++) view = await completeStep(t.app, c, n);
    expect(view.progress).toEqual({ done: 6, total: 6, nextStepId: null });
    expect(view.steps.every((s) => s.status === 'done')).toBe(true);
  });

  it('404s for a step that belongs to another situation', async () => {
    const c = await startCase(t.app, 'death');
    const other = await startCase(t.app, 'move');
    const res = await patchStep(c.id, c.token, other.view.steps[0]!.id, { done: true });
    expect(res.status).toBe(404);
  });

  it('validates the body and refuses extra fields', async () => {
    const c = await startCase(t.app, 'death');
    const id = stepAt(c.view, 1).id;
    for (const body of [{}, { done: 'yes' }, { done: true, doneAt: '2020-01-01' }]) {
      const res = await patchStep(c.id, c.token, id, body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
  });

  it('survives two simultaneous requests for the same step', async () => {
    const c = await startCase(t.app, 'death');
    const s1 = stepAt(c.view, 1);
    for (const doc of s1.documents) await patchDoc(c.id, c.token, doc.documentId, { ticked: true });
    const [a, b] = await Promise.all([
      patchStep(c.id, c.token, s1.id, { done: true }),
      patchStep(c.id, c.token, s1.id, { done: true }),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
    const flags = [a, b].map((r) => (r.body as StepResponse).unchanged).sort();
    expect(flags).toEqual([false, true]);
    expect(
      await t.prisma.caseStep.count({ where: { caseId: c.id, stepId: s1.id, status: 'DONE' } }),
    ).toBe(1);
  });
});

describe('undo', () => {
  it('re-locks every dependent and reports what was reopened', async () => {
    const c = await startCase(t.app, 'death');
    for (let n = 1; n <= 4; n++) await completeStep(t.app, c, n);
    const res = await patchStep(c.id, c.token, stepAt(c.view, 3).id, { done: false });
    expect(res.status).toBe(200);
    const body = res.body as StepResponse;
    expect(body.changes.reopened).toEqual([stepAt(c.view, 3).id, stepAt(c.view, 4).id]);
    expect(body.case.progress.done).toBe(2);
    expect(stepAt(body.case, 3).status).toBe('ready');
    expect(stepAt(body.case, 4).status).toBe('locked');
    expect(stepAt(body.case, 4).blockedBy.map((b) => b.number)).toEqual([3]);
    expect(stepAt(body.case, 4).doneAt).toBeNull();
    // The produced documents are un-ticked again with the step that produced them.
    expect(stepAt(body.case, 4).documents[0]).toMatchObject({ state: 'wait' });
  });

  it('reports steps that closed again', async () => {
    const c = await startCase(t.app, 'death');
    await completeStep(t.app, c, 1);
    const res = await patchStep(c.id, c.token, stepAt(c.view, 1).id, { done: false });
    expect((res.body as StepResponse).changes).toEqual({
      unlocked: [],
      relocked: [stepAt(c.view, 2).id],
      reopened: [stepAt(c.view, 1).id],
    });
  });

  it('keeps ticks on carried documents, so redoing the step is quick', async () => {
    const c = await startCase(t.app, 'death');
    await completeStep(t.app, c, 1);
    await patchStep(c.id, c.token, stepAt(c.view, 1).id, { done: false });
    const view = await fetchCase(t.app, c);
    expect(stepAt(view, 1).docsComplete).toBe(true);
    expect(stepAt(view, 1).canComplete).toBe(true);
  });

  it('is idempotent for a step that is not done', async () => {
    const c = await startCase(t.app, 'death');
    const res = await patchStep(c.id, c.token, stepAt(c.view, 3).id, { done: false });
    expect(res.status).toBe(200);
    expect((res.body as StepResponse).unchanged).toBe(true);
  });
});

describe('documents', () => {
  it('ticks and unticks a carried document', async () => {
    const c = await startCase(t.app, 'death');
    const doc = stepAt(c.view, 1).documents[0]!;
    const on = await patchDoc(c.id, c.token, doc.documentId, { ticked: true });
    expect(stepAt((on.body as { case: CaseView }).case, 1).documents[0]?.state).toBe('ticked');
    const off = await patchDoc(c.id, c.token, doc.documentId, { ticked: false });
    expect(stepAt((off.body as { case: CaseView }).case, 1).documents[0]?.state).toBe('open');
  });

  it('refuses to tick a document that an earlier step hands over', async () => {
    const c = await startCase(t.app, 'death');
    const produced = stepAt(c.view, 2).documents[0]!;
    expect(produced.state).toBe('wait');
    const res = await patchDoc(c.id, c.token, produced.documentId, { ticked: true });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('document_not_tickable');
  });

  it('404s for a document the situation never asks for', async () => {
    const c = await startCase(t.app, 'death');
    const other = await startCase(t.app, 'move');
    const foreign = other.view.steps[0]!.documents[0]!.documentId;
    expect((await patchDoc(c.id, c.token, foreign, { ticked: true })).status).toBe(404);
    expect((await patchDoc(c.id, c.token, 'nope', { ticked: true })).status).toBe(404);
  });

  it("shares one tick across steps: ticking the child's birth certificate once covers both steps", async () => {
    const c = await startCase(t.app, 'move');
    const m4 = stepAt(c.view, 4);
    const birth = m4.documents.find((d) => d.label === "Child's birth certificate")!;
    const res = await patchDoc(c.id, c.token, birth.documentId, { ticked: true });
    const view = (res.body as { case: CaseView }).case;
    const m5 = stepAt(view, 5);
    expect(m5.documents.find((d) => d.label === "Child's birth certificate")?.state).toBe('ticked');
  });

  it('validates the body', async () => {
    const c = await startCase(t.app, 'death');
    const id = stepAt(c.view, 1).documents[0]!.documentId;
    expect((await patchDoc(c.id, c.token, id, { ticked: 'yes' })).status).toBe(400);
    expect((await patchDoc(c.id, c.token, id, {})).status).toBe(400);
  });
});

describe('PATCH /cases/:id (settings)', () => {
  const patch = (c: { id: string; token: string }, body: unknown) =>
    request(t.app)
      .patch(`/cases/${c.id}`)
      .set(bearer(c.token))
      .send(body as object);

  it('sets and clears the event date', async () => {
    const c = await startCase(t.app, 'death');
    const set = await patch(c, { eventDate: '2026-10-01' });
    expect((set.body as { case: CaseView }).case.eventDate).toBe('2026-10-01');
    expect(stepAt((set.body as { case: CaseView }).case, 2).deadline).toBe('2026-10-22');
    const cleared = await patch(c, { eventDate: null });
    expect((cleared.body as { case: CaseView }).case.eventDate).toBeNull();
    expect(stepAt((cleared.body as { case: CaseView }).case, 2).deadline).toBeNull();
  });

  it('turns overdue after the deadline passes', async () => {
    const c = await startCase(t.app, 'death', '2026-09-01');
    expect(stepAt(c.view, 2)).toMatchObject({ deadline: '2026-09-22', deadlineState: 'overdue' });
  });

  it('needs an email to opt in to reminders, and forgets it on opt-out', async () => {
    const c = await startCase(t.app, 'death');
    const noEmail = await patch(c, { remindersOptIn: true });
    expect(noEmail.status).toBe(400);
    expect(noEmail.body.error.code).toBe('email_required');

    const on = await patch(c, { remindersOptIn: true, reminderEmail: '  Asha@Example.COM ' });
    expect(on.status).toBe(200);
    expect((on.body as { case: CaseView }).case).toMatchObject({
      remindersOptIn: true,
      reminderEmail: 'asha@example.com',
    });

    const off = await patch(c, { remindersOptIn: false });
    expect((off.body as { case: CaseView }).case).toMatchObject({
      remindersOptIn: false,
      reminderEmail: null,
    });
    expect(
      (await t.prisma.case.findUniqueOrThrow({ where: { id: c.id } })).reminderEmail,
    ).toBeNull();
  });

  it('validates input', async () => {
    const c = await startCase(t.app, 'death');
    for (const body of [
      {},
      { reminderEmail: 'not-an-email' },
      { eventDate: '2026-13-01' },
      { tokenHash: 'x' },
      { remindersOptIn: 'yes' },
    ]) {
      const res = await patch(c, body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
  });
});

describe('reset and delete', () => {
  it('reset clears progress and ticks but keeps the event date', async () => {
    const c = await startCase(t.app, 'death', '2026-10-01');
    await completeStep(t.app, c, 1);
    await completeStep(t.app, c, 2);
    const res = await request(t.app).post(`/cases/${c.id}/reset`).set(bearer(c.token));
    expect(res.status).toBe(200);
    const view = (res.body as { case: CaseView }).case;
    expect(view.progress.done).toBe(0);
    expect(view.eventDate).toBe('2026-10-01');
    expect(stepAt(view, 1).status).toBe('ready');
    expect(stepAt(view, 1).documents.every((d) => d.state === 'open')).toBe(true);
    expect(await t.prisma.caseDocument.count({ where: { caseId: c.id } })).toBe(0);
  });

  it('delete removes the case and everything attached', async () => {
    const c = await startCase(t.app, 'death');
    await completeStep(t.app, c, 1);
    const res = await request(t.app).delete(`/cases/${c.id}`).set(bearer(c.token));
    expect(res.status).toBe(204);
    expect((await request(t.app).get(`/cases/${c.id}`).set(bearer(c.token))).status).toBe(404);
    expect(await t.prisma.caseStep.count({ where: { caseId: c.id } })).toBe(0);
    expect(await t.prisma.caseDocument.count({ where: { caseId: c.id } })).toBe(0);
  });
});

describe('cases are independent', () => {
  it('does not leak progress between cases of the same situation', async () => {
    const a = await startCase(t.app, 'death');
    const b = await startCase(t.app, 'death');
    await completeStep(t.app, a, 1);
    expect((await fetchCase(t.app, a)).progress.done).toBe(1);
    expect((await fetchCase(t.app, b)).progress.done).toBe(0);
  });

  it('never stores an uploaded document: only have-it / do not have-it', async () => {
    const c = await startCase(t.app, 'death');
    await patchDoc(c.id, c.token, stepAt(c.view, 1).documents[0]!.documentId, { ticked: true });
    const rows = await t.prisma.caseDocument.findMany({ where: { caseId: c.id } });
    expect(Object.keys(rows[0]!).sort()).toEqual([
      'caseId',
      'documentId',
      'id',
      'ticked',
      'tickedAt',
    ]);
  });
});
