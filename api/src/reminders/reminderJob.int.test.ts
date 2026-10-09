import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { EmailProvider } from '../email/provider.js';
import { verifyUnsubscribeSignature } from '../security/unsubscribe.js';
import { seedDatabase } from '../seed/seed.js';
import {
  bearer,
  completeStep,
  createTestApp,
  FIXED_NOW,
  startCase,
  type StartedCase,
  testConfig,
} from '../test/appKit.js';
import { resetDatabase } from '../test/db.js';
import { RecordingEmail } from '../test/email.js';
import { runReminders } from './reminderJob.js';

const t = createTestApp();
const config = testConfig();
let email: RecordingEmail;

beforeEach(async () => {
  await resetDatabase(t.prisma);
  await seedDatabase(t.prisma);
  t.setNow(FIXED_NOW);
  email = new RecordingEmail();
});
afterAll(async () => {
  await t.close();
});

/** A case that opted in to reminders (through the real API, as a visitor would). */
async function optedIn(slug: string, eventDate: string | null, to = 'asha@example.com') {
  const c = await startCase(t.app, slug, eventDate ?? undefined);
  const res = await request(t.app)
    .patch(`/cases/${c.id}`)
    .set(bearer(c.token))
    .send({ remindersOptIn: true, reminderEmail: to });
  expect(res.status).toBe(200);
  return c;
}

function run(over: { now?: Date; email?: EmailProvider; pageSize?: number } = {}) {
  return runReminders({
    prisma: t.prisma,
    email: over.email ?? email,
    config,
    now: over.now ?? FIXED_NOW,
    logError: () => undefined,
    ...(over.pageSize ? { pageSize: over.pageSize } : {}),
  });
}

describe('reminders: what is sent', () => {
  it('sends one email for a step due in the next 3 days', async () => {
    const c = await optedIn('death', '2026-09-20'); // "register the death" is due 11 Oct
    const summary = await run();
    expect(summary).toEqual({ casesChecked: 1, emailsSent: 1, stepsReminded: 1, failures: 0 });
    expect(email.sent).toHaveLength(1);
    const mail = email.sent[0];
    expect(mail?.to).toBe('asha@example.com');
    expect(mail?.subject).toBe('Reminder: 1 step is due soon · A parent has passed away');
    expect(mail?.text).toContain('- Register the death: due 11 Oct 2026 (in 2 days)');
    expect(mail?.text).toContain(`Open your route: http://localhost:8080/case/${c.id}`);
    expect(mail?.text).toContain('Date of death: 20 Sep 2026');
    expect(mail?.text).toContain('guidance, not legal advice');
  });

  it('puts a working unsubscribe link in every email, and never the access token', async () => {
    const c = await optedIn('death', '2026-09-20');
    await run();
    const text = email.sent[0]?.text ?? '';
    expect(text).not.toContain(c.token);
    const link = /Stop these reminders: (\S+)/.exec(text)?.[1] ?? '';
    const url = new URL(link);
    expect(url.pathname).toBe('/unsubscribe');
    expect(url.searchParams.get('case')).toBe(c.id);
    expect(
      verifyUnsubscribeSignature(c.id, url.searchParams.get('sig') ?? '', config.sessionSecret),
    ).toBe(true);
  });

  it('records what it sent, so a step is reminded once per deadline', async () => {
    const c = await optedIn('death', '2026-09-20');
    await run();
    const logs = await t.prisma.reminderLog.findMany({ where: { caseId: c.id } });
    expect(logs).toHaveLength(1);
    expect(logs[0]?.dueDate.toISOString()).toBe('2026-10-11T00:00:00.000Z');
    expect(logs[0]?.email).toBe('asha@example.com');
  });

  it.each([
    ['2026-09-17', false, 'yesterday: already overdue'],
    ['2026-09-18', true, 'today'],
    ['2026-09-20', true, 'in 2 days'],
    ['2026-09-21', true, 'in 3 days: the last day of the window'],
    ['2026-09-22', false, 'in 4 days: too early'],
  ])('event date %s (deadline %s): sent = %s', async (eventDate, shouldSend) => {
    await optedIn('death', eventDate);
    await run();
    expect(email.sent.length).toBe(shouldSend ? 1 : 0);
  });

  it('includes a locked step and says what to finish first', async () => {
    // Move-in tomorrow: "sign the rental agreement" (ready) and "start electricity" (waits for it) are both due.
    await optedIn('move', '2026-10-10');
    await run();
    expect(email.sent).toHaveLength(1);
    const text = email.sent[0]?.text ?? '';
    expect(email.sent[0]?.subject).toContain('2 steps are due soon');
    expect(text).toContain('- Sign the rental agreement: due 10 Oct 2026 (tomorrow)');
    expect(text).toContain('- Start the electricity connection: due 10 Oct 2026 (tomorrow)');
    expect(text).toContain('Finish first: Sign the rental agreement');
  });

  it("sends one email per case, to each case's own address", async () => {
    await optedIn('death', '2026-09-20', 'one@example.com');
    await optedIn('death', '2026-09-20', 'two@example.com');
    const summary = await run();
    expect(summary).toMatchObject({ casesChecked: 2, emailsSent: 2 });
    expect(email.sent.map((m) => m.to).sort()).toEqual(['one@example.com', 'two@example.com']);
  });
});

describe('reminders: who is NOT emailed', () => {
  it('skips a case that did not opt in', async () => {
    await startCase(t.app, 'death', '2026-09-20');
    expect(await run()).toMatchObject({ casesChecked: 0, emailsSent: 0 });
    expect(email.sent).toEqual([]);
  });

  it('skips a case with no event date (no deadline can be computed)', async () => {
    await optedIn('death', null);
    expect(await run()).toMatchObject({ casesChecked: 0, emailsSent: 0 });
  });

  it('skips a step that is already done', async () => {
    const c = await optedIn('death', '2026-09-20');
    await completeStep(t.app, c, 1);
    await completeStep(t.app, c, 2); // "register the death" is done, so there is nothing to remind
    await run();
    expect(email.sent).toEqual([]);
  });

  it('forgets a visitor who opted out', async () => {
    const c = await optedIn('death', '2026-09-20');
    await request(t.app)
      .patch(`/cases/${c.id}`)
      .set(bearer(c.token))
      .send({ remindersOptIn: false });
    await run();
    expect(email.sent).toEqual([]);
    const row = await t.prisma.case.findUniqueOrThrow({ where: { id: c.id } });
    expect(row).toMatchObject({ remindersOptIn: false, reminderEmail: null });
  });

  it('deletes the log of addresses when the case is deleted', async () => {
    const c = await optedIn('death', '2026-09-20');
    await run();
    expect(await t.prisma.reminderLog.count()).toBe(1);
    await request(t.app).delete(`/cases/${c.id}`).set(bearer(c.token));
    expect(await t.prisma.reminderLog.count()).toBe(0);
  });

  it('clears the sent-log when a visitor opts out', async () => {
    const c = await optedIn('death', '2026-09-20');
    await run();
    await request(t.app)
      .patch(`/cases/${c.id}`)
      .set(bearer(c.token))
      .send({ remindersOptIn: false });
    expect(await t.prisma.reminderLog.count({ where: { caseId: c.id } })).toBe(0);
  });
});

describe('reminders: once per deadline, safe to repeat', () => {
  it('does not send the same reminder twice', async () => {
    await optedIn('death', '2026-09-20');
    await run();
    const second = await run();
    expect(second).toMatchObject({ emailsSent: 0, stepsReminded: 0, failures: 0 });
    expect(email.sent).toHaveLength(1);
  });

  it('does not repeat it the next day either', async () => {
    await optedIn('death', '2026-09-20');
    await run();
    await run({ now: new Date(FIXED_NOW.getTime() + 86_400_000) }); // 10 Oct: still due, already reminded
    expect(email.sent).toHaveLength(1);
  });

  it('reminds again when the event date changes and the deadline moves', async () => {
    const c = await optedIn('death', '2026-09-20');
    await run();
    await request(t.app)
      .patch(`/cases/${c.id}`)
      .set(bearer(c.token))
      .send({ eventDate: '2026-09-21' });
    await run(); // new deadline 12 Oct, still in the window
    expect(email.sent).toHaveLength(2);
    expect(email.sent[1]?.text).toContain('due 12 Oct 2026');
  });

  it('sends exactly one email when two runs overlap', async () => {
    await optedIn('death', '2026-09-20');
    const [a, b] = await Promise.all([run(), run()]);
    expect(email.sent).toHaveLength(1);
    expect(a.emailsSent + b.emailsSent).toBe(1);
    expect(await t.prisma.reminderLog.count()).toBe(1);
  });
});

describe('reminders: failures', () => {
  it('releases the claim when sending fails, then retries on the next run', async () => {
    const c = await optedIn('death', '2026-09-20');
    email.failFor = () => true;
    const first = await run();
    expect(first).toMatchObject({ emailsSent: 0, failures: 1 });
    expect(await t.prisma.reminderLog.count({ where: { caseId: c.id } })).toBe(0);

    email.failFor = () => false;
    const second = await run();
    expect(second).toMatchObject({ emailsSent: 1, failures: 0 });
    expect(email.sent).toHaveLength(1);
  });

  it('keeps going with the other cases when one address fails', async () => {
    await optedIn('death', '2026-09-20', 'bad@example.com');
    await optedIn('death', '2026-09-20', 'good@example.com');
    email.failFor = (to) => to === 'bad@example.com';
    const summary = await run();
    expect(summary).toMatchObject({ casesChecked: 2, emailsSent: 1, failures: 1 });
    expect(email.sent.map((m) => m.to)).toEqual(['good@example.com']);
  });
});

describe('reminders: time and scale', () => {
  it('counts days in India, not UTC', async () => {
    await optedIn('death', '2026-09-18'); // "register the death" is due 9 Oct
    // 9 Oct, 19:00 UTC is already 10 Oct 00:30 in India: the deadline has passed.
    await run({ now: new Date('2026-10-09T19:00:00Z') });
    expect(email.sent).toEqual([]);
    // 9 Oct, 18:00 UTC is 9 Oct 23:30 in India: still due today.
    await run({ now: new Date('2026-10-09T18:00:00Z') });
    expect(email.sent).toHaveLength(1);
  });

  it('works through more cases than fit on one page', async () => {
    for (let i = 0; i < 5; i++) await optedIn('death', '2026-09-20', `person${i}@example.com`);
    const summary = await run({ pageSize: 2 });
    expect(summary).toMatchObject({ casesChecked: 5, emailsSent: 5 });
    expect(new Set(email.sent.map((m) => m.to)).size).toBe(5);
  });

  it('does nothing when there are no cases', async () => {
    expect(await run()).toEqual({ casesChecked: 0, emailsSent: 0, stepsReminded: 0, failures: 0 });
  });
});

describe('POST /reminders/unsubscribe', () => {
  async function linkFor(c: StartedCase, to = 'asha@example.com') {
    await run();
    const mail = email.sent.filter((m) => m.to === to).at(-1);
    const link = /Stop these reminders: (\S+)/.exec(mail?.text ?? '')?.[1] ?? '';
    const url = new URL(link);
    return {
      caseId: url.searchParams.get('case') ?? '',
      sig: url.searchParams.get('sig') ?? '',
      c,
    };
  }

  it('turns reminders off and forgets the address and the sent-log', async () => {
    const c = await optedIn('death', '2026-09-20');
    const { caseId, sig } = await linkFor(c);
    const res = await request(t.app).post('/reminders/unsubscribe').send({ caseId, sig });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    const row = await t.prisma.case.findUniqueOrThrow({ where: { id: c.id } });
    expect(row).toMatchObject({ remindersOptIn: false, reminderEmail: null });
    expect(await t.prisma.reminderLog.count({ where: { caseId: c.id } })).toBe(0);
    email.sent.length = 0;
    await run({ now: new Date(FIXED_NOW.getTime() + 86_400_000) });
    expect(email.sent).toEqual([]);
  });

  it('is idempotent', async () => {
    const c = await optedIn('death', '2026-09-20');
    const { caseId, sig } = await linkFor(c);
    expect((await request(t.app).post('/reminders/unsubscribe').send({ caseId, sig })).status).toBe(
      200,
    );
    expect((await request(t.app).post('/reminders/unsubscribe').send({ caseId, sig })).status).toBe(
      200,
    );
  });

  it('refuses a bad or borrowed signature and changes nothing', async () => {
    const c = await optedIn('death', '2026-09-20');
    const other = await optedIn('death', '2026-09-20', 'other@example.com');
    const { sig } = await linkFor(c);
    for (const body of [
      { caseId: c.id, sig: 'x'.repeat(43) },
      { caseId: other.id, sig }, // a signature made for a different case
      { caseId: c.id, sig: `${sig.slice(0, -1)}A` },
    ]) {
      const res = await request(t.app).post('/reminders/unsubscribe').send(body);
      expect(res.status, JSON.stringify(body)).toBe(403);
    }
    const row = await t.prisma.case.findUniqueOrThrow({ where: { id: c.id } });
    expect(row.remindersOptIn).toBe(true);
    const row2 = await t.prisma.case.findUniqueOrThrow({ where: { id: other.id } });
    expect(row2.reminderEmail).toBe('other@example.com');
  });

  it('answers the same for a case that no longer exists', async () => {
    const c = await optedIn('death', '2026-09-20');
    const { caseId, sig } = await linkFor(c);
    await t.prisma.case.delete({ where: { id: c.id } });
    expect((await request(t.app).post('/reminders/unsubscribe').send({ caseId, sig })).status).toBe(
      200,
    );
  });

  it('validates the body, and is not available as GET', async () => {
    expect((await request(t.app).post('/reminders/unsubscribe').send({})).status).toBe(400);
    expect(
      (await request(t.app).post('/reminders/unsubscribe').send({ caseId: 'x', sig: 'short' }))
        .status,
    ).toBe(400);
    expect((await request(t.app).get('/reminders/unsubscribe?caseId=x&sig=y')).status).toBe(404);
  });
});
