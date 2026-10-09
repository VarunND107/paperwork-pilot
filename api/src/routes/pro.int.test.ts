import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { seedDatabase } from '../seed/seed.js';
import type { ClientList, ClientRow, MemberView } from '../pro/types.js';
import { hashToken } from '../security/tokens.js';
import type { CaseView } from '../services/types.js';
import { bearer, createTestApp, FIXED_NOW, startCase, testConfig } from '../test/appKit.js';
import { resetDatabase } from '../test/db.js';

const t = createTestApp();
const off = createTestApp({ prisma: t.prisma, config: testConfig({ PRO_ENABLED: 'false' }) });

beforeEach(async () => {
  await resetDatabase(t.prisma);
  await seedDatabase(t.prisma);
  t.setNow(FIXED_NOW);
});
afterAll(async () => {
  await t.close();
});

interface SignedUp {
  token: string;
  org: { id: string; name: string };
  member: MemberView;
}

async function signUp(over: Record<string, unknown> = {}): Promise<SignedUp> {
  const res = await request(t.app)
    .post('/pro/orgs')
    .send({ orgName: 'Rao & Co', name: 'Meera Rao', email: 'Meera@Example.com', ...over });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body as SignedUp;
}

async function addClient(key: string, over: Record<string, unknown> = {}): Promise<ClientRow> {
  const res = await request(t.app)
    .post('/pro/clients')
    .set(bearer(key))
    .send({ clientName: 'Anita Kumar', eventId: 'death', ...over });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return (res.body as { client: ClientRow }).client;
}

const clients = async (key: string, query: Record<string, string> = {}) =>
  (await request(t.app).get('/pro/clients').set(bearer(key)).query(query)).body as ClientList;

/** Ticks every open document of the given step and optionally marks it done, as a member. */
async function work(key: string, caseId: string, stepNumber: number, done: boolean) {
  const view = (
    (await request(t.app).get(`/cases/${caseId}`).set(bearer(key))).body as { case: CaseView }
  ).case;
  const step = view.steps.find((s) => s.number === stepNumber);
  if (!step) throw new Error(`no step ${stepNumber}`);
  for (const doc of step.documents.filter((d) => d.state === 'open')) {
    await request(t.app)
      .patch(`/cases/${caseId}/documents/${doc.documentId}`)
      .set(bearer(key))
      .send({ ticked: true })
      .expect(200);
  }
  if (done) {
    await request(t.app)
      .patch(`/cases/${caseId}/steps/${step.id}`)
      .set(bearer(key))
      .send({ done: true })
      .expect(200);
  }
}

describe('the professional plan is off by default', () => {
  it('answers 404 to every /pro route when PRO_ENABLED is off', async () => {
    const calls = [
      request(off.app).post('/pro/orgs').send({ orgName: 'X', name: 'Y', email: 'a@b.co' }),
      request(off.app).get('/pro/me'),
      request(off.app).get('/pro/clients'),
      request(off.app).post('/pro/clients').send({}),
      request(off.app).get('/pro/clients/x'),
      request(off.app).get('/pro/members'),
      request(off.app).post('/pro/members').send({}),
      request(off.app).delete('/pro/members/x'),
      request(off.app).post('/pro/me/rotate-key'),
    ];
    for (const res of await Promise.all(calls)) {
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('not_found');
    }
    expect(await t.prisma.organization.count()).toBe(0);
  });

  it('stops accepting a member key on /cases when the plan is switched off', async () => {
    const owner = await signUp();
    const client = await addClient(owner.token);
    const on = await request(t.app).get(`/cases/${client.id}`).set(bearer(owner.token));
    expect(on.status).toBe(200);
    const after = await request(off.app).get(`/cases/${client.id}`).set(bearer(owner.token));
    expect(after.status).toBe(404);
  });
});

describe('organisations and sign-in', () => {
  it('creates an organisation whose first member owns it, and hands out the key once', async () => {
    const { token, org, member } = await signUp();
    expect(token).toMatch(/^pp_member_/);
    expect(org.name).toBe('Rao & Co');
    expect(member).toMatchObject({ name: 'Meera Rao', email: 'meera@example.com', role: 'OWNER' });

    const row = await t.prisma.orgMember.findUniqueOrThrow({ where: { id: member.id } });
    expect(row.tokenHash).toBe(hashToken(token));
    expect(JSON.stringify(row)).not.toContain(token);
    expect(row.userId).not.toBeNull();
  });

  it('reuses one user row for the same email in two organisations', async () => {
    await signUp({ orgName: 'First' });
    await signUp({ orgName: 'Second' });
    expect(await t.prisma.organization.count()).toBe(2);
    expect(await t.prisma.user.count()).toBe(1);
  });

  it.each([
    ['no organisation name', { orgName: '' }],
    ['no name', { name: '  ' }],
    ['a bad email', { email: 'not-an-email' }],
    ['an unknown field', { role: 'OWNER' }],
  ])('refuses %s', async (_name, over) => {
    const res = await request(t.app)
      .post('/pro/orgs')
      .send({ orgName: 'Rao & Co', name: 'Meera', email: 'm@example.com', ...over });
    expect(res.status).toBe(400);
    expect(await t.prisma.organization.count()).toBe(0);
  });

  it('is rate limited', async () => {
    const limited = createTestApp({ prisma: t.prisma, rateLimits: { createOrg: 2 } }).app;
    const codes: number[] = [];
    for (let i = 0; i < 4; i++) {
      codes.push(
        (
          await request(limited)
            .post('/pro/orgs')
            .send({ orgName: `Org ${i}`, name: 'Meera', email: `m${i}@example.com` })
        ).status,
      );
    }
    expect(codes).toEqual([201, 201, 429, 429]);
  });

  it('knows who is signed in', async () => {
    const owner = await signUp();
    const me = await request(t.app).get('/pro/me').set(bearer(owner.token));
    expect(me.status).toBe(200);
    expect(me.body).toEqual({ member: owner.member, org: owner.org });
  });

  it('needs a valid member key, not a case key', async () => {
    const owner = await signUp();
    const anonymous = await startCase(t.app, 'death');
    const attempts = [
      request(t.app).get('/pro/me'),
      request(t.app).get('/pro/me').set(bearer('pp_member_does-not-exist-0123456789')),
      request(t.app).get('/pro/me').set(bearer(anonymous.token)),
      request(t.app).get('/pro/clients').set(bearer(anonymous.token)),
    ];
    for (const res of await Promise.all(attempts)) expect(res.status).toBe(401);
    expect((await request(t.app).get('/pro/me').set(bearer(owner.token))).status).toBe(200);
  });

  it('replaces an access key: the old one stops working at once', async () => {
    const owner = await signUp();
    const rotated = await request(t.app).post('/pro/me/rotate-key').set(bearer(owner.token));
    expect(rotated.status).toBe(200);
    const fresh = rotated.body.token as string;
    expect(fresh).toMatch(/^pp_member_/);
    expect(fresh).not.toBe(owner.token);
    expect((await request(t.app).get('/pro/me').set(bearer(owner.token))).status).toBe(401);
    expect((await request(t.app).get('/pro/me').set(bearer(fresh))).status).toBe(200);
  });
});

describe('clients', () => {
  it('adds a client on a situation and starts them at the beginning', async () => {
    const owner = await signUp();
    const client = await addClient(owner.token);
    expect(client).toMatchObject({
      clientName: 'Anita Kumar',
      event: { slug: 'death', label: 'A parent has passed away' },
      eventDate: null,
      progress: { done: 0, total: 6 },
      next: { number: 1, title: 'Get the medical certificate of cause of death' },
    });
    const row = await t.prisma.case.findUniqueOrThrow({ where: { id: client.id } });
    expect(row.orgId).toBe(owner.org.id);
    expect(row.clientName).toBe('Anita Kumar');
  });

  it('refuses a missing name, an unknown situation and an implausible date', async () => {
    const owner = await signUp();
    const post = (body: Record<string, unknown>) =>
      request(t.app).post('/pro/clients').set(bearer(owner.token)).send(body);
    expect((await post({ clientName: ' ', eventId: 'death' })).status).toBe(400);
    expect((await post({ clientName: 'A', eventId: 'nope' })).status).toBe(404);
    expect(
      (await post({ clientName: 'A', eventId: 'death', eventDate: '1999-01-01' })).status,
    ).toBe(400);
    expect((await post({ clientName: 'A', eventId: 'death', extra: 1 })).status).toBe(400);
    expect(await t.prisma.case.count()).toBe(0);
  });

  it('shows a client who lacks a document as "needs document", naming what is missing', async () => {
    const owner = await signUp();
    const client = await addClient(owner.token);
    expect(client.status).toBe('needs_document');
    expect(client.missingDocuments).toEqual([
      'Hospital discharge or death summary',
      'ID of the person who died',
    ]);
  });

  it('turns "on track" once the next step has what it needs, and counts progress', async () => {
    const owner = await signUp();
    const client = await addClient(owner.token);
    await work(owner.token, client.id, 1, false);
    let row = (await clients(owner.token)).clients[0];
    expect(row).toMatchObject({ status: 'on_track', missingDocuments: [], progress: { done: 0 } });

    await work(owner.token, client.id, 1, true);
    row = (await clients(owner.token)).clients[0];
    expect(row?.progress.done).toBe(1);
    expect(row?.next?.number).toBe(2);
    expect(row?.status).toBe('needs_document');
  });

  it('turns "overdue" when a step is past its deadline', async () => {
    const owner = await signUp();
    // Died 40 days before the fixed "today": registering within 21 days is already late.
    const client = await addClient(owner.token, { eventDate: '2026-08-30' });
    await work(owner.token, client.id, 1, true);
    await work(owner.token, client.id, 2, false);
    const row = (await clients(owner.token)).clients[0];
    expect(row?.status).toBe('overdue');
    expect(row?.overdueSteps).toBeGreaterThanOrEqual(1);
    expect(row?.next).toMatchObject({ number: 2, title: 'Register the death', daysLeft: -19 });
  });

  it('lists the clients that need attention first, then by name', async () => {
    const owner = await signUp();
    const calm = await addClient(owner.token, { clientName: 'Zed Calm' });
    await work(owner.token, calm.id, 1, false);
    await addClient(owner.token, { clientName: 'Bela Docs' });
    const late = await addClient(owner.token, {
      clientName: 'Chandra Late',
      eventDate: '2026-08-30',
    });
    await work(owner.token, late.id, 1, true);
    await addClient(owner.token, { clientName: 'Anil Docs' });
    const list = await clients(owner.token);
    expect(list.clients.map((c) => `${c.clientName}:${c.status}`)).toEqual([
      'Chandra Late:overdue',
      'Anil Docs:needs_document',
      'Bela Docs:needs_document',
      'Zed Calm:on_track',
    ]);
    expect(list.counts).toEqual({ all: 4, onTrack: 1, needsDocument: 2, overdue: 1 });
    expect(list.total).toBe(4);
    expect(list.truncated).toBe(false);
  });

  describe('filters', () => {
    async function setup() {
      const owner = await signUp();
      const calm = await addClient(owner.token, { clientName: 'Zed Calm' });
      await work(owner.token, calm.id, 1, false);
      await addClient(owner.token, { clientName: 'Bela Docs' });
      await addClient(owner.token, { clientName: 'Meena Mover', eventId: 'move' });
      return owner;
    }

    it('"attention" hides clients who are on track, but the counts still include them', async () => {
      const owner = await setup();
      const list = await clients(owner.token, { filter: 'attention' });
      expect(list.clients.map((c) => c.clientName)).toEqual(['Bela Docs', 'Meena Mover']);
      expect(list.counts.all).toBe(3);
    });

    it('filters by one status', async () => {
      const owner = await setup();
      expect(
        (await clients(owner.token, { status: 'on_track' })).clients.map((c) => c.clientName),
      ).toEqual(['Zed Calm']);
      expect((await clients(owner.token, { status: 'overdue' })).clients).toEqual([]);
    });

    it('filters by situation, by slug or id, and the counts follow', async () => {
      const owner = await setup();
      const bySlug = await clients(owner.token, { event: 'move' });
      expect(bySlug.clients.map((c) => c.clientName)).toEqual(['Meena Mover']);
      expect(bySlug.counts.all).toBe(1);
      const id = bySlug.clients[0]?.event.id ?? '';
      expect((await clients(owner.token, { event: id })).clients).toHaveLength(1);
    });

    it('searches by name, ignoring case', async () => {
      const owner = await setup();
      expect((await clients(owner.token, { q: 'DOCS' })).clients.map((c) => c.clientName)).toEqual([
        'Bela Docs',
      ]);
      expect((await clients(owner.token, { q: 'nobody' })).clients).toEqual([]);
    });

    it('refuses a filter it does not know', async () => {
      const owner = await setup();
      const res = await request(t.app)
        .get('/pro/clients')
        .set(bearer(owner.token))
        .query({ status: 'bogus' });
      expect(res.status).toBe(400);
    });
  });

  it('renames a client', async () => {
    const owner = await signUp();
    const client = await addClient(owner.token);
    const res = await request(t.app)
      .patch(`/pro/clients/${client.id}`)
      .set(bearer(owner.token))
      .send({ clientName: 'Anita Kumar (estate)' });
    expect(res.status).toBe(200);
    expect(res.body.client.clientName).toBe('Anita Kumar (estate)');
    expect(
      (await request(t.app).patch(`/pro/clients/${client.id}`).set(bearer(owner.token)).send({}))
        .status,
    ).toBe(400);
  });

  it("keeps one organisation out of another's clients, in every route", async () => {
    const a = await signUp({ orgName: 'A', email: 'a@example.com' });
    const b = await signUp({ orgName: 'B', email: 'b@example.com' });
    const secret = await addClient(a.token, { clientName: 'Private Client' });
    const stepId = (
      (await request(t.app).get(`/cases/${secret.id}`).set(bearer(a.token))).body as {
        case: CaseView;
      }
    ).case.steps[0]?.id;

    expect((await clients(b.token)).clients).toEqual([]);
    const attempts = [
      request(t.app).get(`/pro/clients/${secret.id}`).set(bearer(b.token)),
      request(t.app)
        .patch(`/pro/clients/${secret.id}`)
        .set(bearer(b.token))
        .send({ clientName: 'X' }),
      request(t.app).get(`/cases/${secret.id}`).set(bearer(b.token)),
      request(t.app)
        .patch(`/cases/${secret.id}`)
        .set(bearer(b.token))
        .send({ eventDate: '2026-10-01' }),
      request(t.app)
        .patch(`/cases/${secret.id}/steps/${stepId}`)
        .set(bearer(b.token))
        .send({ done: true }),
      request(t.app).post(`/cases/${secret.id}/reset`).set(bearer(b.token)),
      request(t.app).delete(`/cases/${secret.id}`).set(bearer(b.token)),
    ];
    for (const res of await Promise.all(attempts)) expect(res.status).toBe(404);
    const row = await t.prisma.case.findUniqueOrThrow({ where: { id: secret.id } });
    expect(row.clientName).toBe('Private Client');
  });

  it("lets a member key work an organisation case through /cases, and nobody else's", async () => {
    const owner = await signUp();
    const client = await addClient(owner.token);
    const anonymous = await startCase(t.app, 'death');

    const view = await request(t.app).get(`/cases/${client.id}`).set(bearer(owner.token));
    expect(view.status).toBe(200);
    // An ordinary visitor's case is not reachable with a member key.
    expect(
      (await request(t.app).get(`/cases/${anonymous.id}`).set(bearer(owner.token))).status,
    ).toBe(404);
    // A member can also delete a client's case.
    expect(
      (await request(t.app).delete(`/cases/${client.id}`).set(bearer(owner.token))).status,
    ).toBe(204);
    expect((await clients(owner.token)).total).toBe(0);
  });

  it('opens one client with the same row the dashboard shows', async () => {
    const owner = await signUp();
    const client = await addClient(owner.token);
    const one = await request(t.app).get(`/pro/clients/${client.id}`).set(bearer(owner.token));
    expect(one.body.client).toEqual((await clients(owner.token)).clients[0]);
    expect((await request(t.app).get('/pro/clients/missing').set(bearer(owner.token))).status).toBe(
      404,
    );
  });
});

describe('team', () => {
  it('lists the team to any member', async () => {
    const owner = await signUp();
    const res = await request(t.app).get('/pro/members').set(bearer(owner.token));
    expect(res.body.members).toEqual([owner.member]);
  });

  it('lets an owner add a colleague, who then sees the same clients', async () => {
    const owner = await signUp();
    await addClient(owner.token, { clientName: 'Shared Client' });
    const added = await request(t.app)
      .post('/pro/members')
      .set(bearer(owner.token))
      .send({ name: 'Dev Nair', email: 'Dev@Example.com' });
    expect(added.status).toBe(201);
    expect(added.body.member).toMatchObject({ role: 'MEMBER', email: 'dev@example.com' });
    const key = added.body.token as string;
    expect(key).toMatch(/^pp_member_/);

    expect((await clients(key)).clients.map((c) => c.clientName)).toEqual(['Shared Client']);
    const row = await t.prisma.orgMember.findUniqueOrThrow({ where: { id: added.body.member.id } });
    expect(row.tokenHash).toBe(hashToken(key));
  });

  it('keeps team changes to owners', async () => {
    const owner = await signUp();
    const colleague = (
      await request(t.app)
        .post('/pro/members')
        .set(bearer(owner.token))
        .send({ name: 'Dev', email: 'dev@example.com' })
    ).body as { token: string; member: MemberView };
    const asMember = bearer(colleague.token);
    expect(
      (
        await request(t.app)
          .post('/pro/members')
          .set(asMember)
          .send({ name: 'X', email: 'x@example.com' })
      ).status,
    ).toBe(403);
    expect(
      (await request(t.app).delete(`/pro/members/${owner.member.id}`).set(asMember)).status,
    ).toBe(403);
    expect((await request(t.app).get('/pro/members').set(asMember)).status).toBe(200);
  });

  it('refuses the same email twice in one team', async () => {
    const owner = await signUp();
    const res = await request(t.app)
      .post('/pro/members')
      .set(bearer(owner.token))
      .send({ name: 'Me again', email: 'meera@example.com' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('member_exists');
  });

  it('removes a colleague, whose key stops working, and never lets an owner remove themselves', async () => {
    const owner = await signUp();
    const colleague = (
      await request(t.app)
        .post('/pro/members')
        .set(bearer(owner.token))
        .send({ name: 'Dev', email: 'dev@example.com' })
    ).body as { token: string; member: MemberView };

    const self = await request(t.app)
      .delete(`/pro/members/${owner.member.id}`)
      .set(bearer(owner.token));
    expect(self.status).toBe(400);
    expect(self.body.error.code).toBe('cannot_remove_self');

    expect(
      (await request(t.app).delete(`/pro/members/${colleague.member.id}`).set(bearer(owner.token)))
        .status,
    ).toBe(204);
    expect((await request(t.app).get('/pro/me').set(bearer(colleague.token))).status).toBe(401);
    expect(
      (await request(t.app).delete(`/pro/members/${colleague.member.id}`).set(bearer(owner.token)))
        .status,
    ).toBe(404);
  });

  it("cannot reach into another organisation's team", async () => {
    const a = await signUp({ orgName: 'A', email: 'a@example.com' });
    const b = await signUp({ orgName: 'B', email: 'b@example.com' });
    expect(
      (await request(t.app).delete(`/pro/members/${b.member.id}`).set(bearer(a.token))).status,
    ).toBe(404);
    expect((await request(t.app).get('/pro/me').set(bearer(b.token))).status).toBe(200);
    const teamOfA = (await request(t.app).get('/pro/members').set(bearer(a.token))).body
      .members as MemberView[];
    expect(teamOfA.map((m) => m.id)).toEqual([a.member.id]);
  });
});
