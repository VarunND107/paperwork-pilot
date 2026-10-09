import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestPrisma, resetDatabase } from '../test/db.js';
import { seedDatabase } from './seed.js';
import { SEED_EVENTS } from './seed-data.js';

const prisma = createTestPrisma();

beforeEach(async () => {
  await resetDatabase(prisma);
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe('seedDatabase', () => {
  it('creates the three sample events with six steps each', async () => {
    const result = await seedDatabase(prisma);
    expect(result.created.sort()).toEqual(['biz', 'death', 'move']);
    expect(result.skipped).toEqual([]);
    expect(await prisma.event.count()).toBe(3);
    expect(await prisma.step.count()).toBe(18);
    expect(await prisma.stepDependency.count()).toBe(
      SEED_EVENTS.flatMap((e) => e.steps).reduce((n, s) => n + s.needs.length, 0),
    );
  });

  it('marks ALL seeded data verified=false with no verification date', async () => {
    await seedDatabase(prisma);
    expect(
      await prisma.event.count({
        where: { OR: [{ verified: true }, { lastVerifiedAt: { not: null } }] },
      }),
    ).toBe(0);
    expect(
      await prisma.step.count({
        where: { OR: [{ verified: true }, { lastVerifiedAt: { not: null } }] },
      }),
    ).toBe(0);
    expect(
      await prisma.document.count({
        where: { OR: [{ verified: true }, { lastVerifiedAt: { not: null } }] },
      }),
    ).toBe(0);
    expect(
      await prisma.office.count({
        where: { OR: [{ verified: true }, { lastVerifiedAt: { not: null } }] },
      }),
    ).toBe(0);
    expect(await prisma.step.count()).toBeGreaterThan(0);
  });

  it('gives every step a source_url', async () => {
    await seedDatabase(prisma);
    const steps = await prisma.step.findMany();
    expect(steps.every((s) => /^https?:\/\//.test(s.sourceUrl))).toBe(true);
  });

  it('seeds one approved sample tip per step, labelled as seed origin', async () => {
    await seedDatabase(prisma);
    expect(await prisma.tip.count({ where: { origin: 'SEED', status: 'APPROVED' } })).toBe(18);
    expect(await prisma.tip.count({ where: { origin: 'USER' } })).toBe(0);
  });

  it('models documents: a requires-row per document and a produces-row on the producing step', async () => {
    await seedDatabase(prisma);
    const s2 = await prisma.step.findFirstOrThrow({ where: { title: 'Register the death' } });
    const s3 = await prisma.step.findFirstOrThrow({
      where: { title: 'Collect certified copies of the death certificate' },
    });
    const rows = await prisma.stepDocument.findMany({
      where: { stepId: s3.id, role: 'REQUIRES' },
      include: { document: true },
      orderBy: { position: 'asc' },
    });
    expect(rows.map((r) => r.document.name)).toEqual([
      'Registration number',
      'ID of the applicant',
    ]);
    expect(rows[0]?.producedByStepId).toBe(s2.id);
    expect(rows[1]?.producedByStepId).toBeNull();
    const produced = await prisma.stepDocument.findMany({
      where: { stepId: s2.id, role: 'PRODUCES' },
      include: { document: true },
    });
    expect(produced.map((r) => r.document.name)).toEqual(['Registration number']);
  });

  it('keeps the exact wording when a step phrases a shared document differently', async () => {
    await seedDatabase(prisma);
    const m4 = await prisma.step.findFirstOrThrow({
      where: { title: "Move your toddler's vaccination record" },
    });
    const row = await prisma.stepDocument.findFirstOrThrow({
      where: { stepId: m4.id, role: 'REQUIRES', label: { not: null } },
      include: { document: true },
    });
    expect(row.label).toBe('Address proof (rental agreement)');
    expect(row.document.name).toBe('Rental agreement');
  });

  it('shares one document and one office across steps', async () => {
    await seedDatabase(prisma);
    expect(await prisma.document.count({ where: { name: "Child's birth certificate" } })).toBe(1);
    expect(await prisma.office.count({ where: { name: 'Sub-registrar office' } })).toBe(1);
  });

  it('is idempotent: a second run creates nothing', async () => {
    await seedDatabase(prisma);
    const before = {
      steps: await prisma.step.count(),
      docs: await prisma.document.count(),
      links: await prisma.stepDocument.count(),
      tips: await prisma.tip.count(),
    };
    const again = await seedDatabase(prisma);
    expect(again.created).toEqual([]);
    expect(again.skipped.sort()).toEqual(['biz', 'death', 'move']);
    expect({
      steps: await prisma.step.count(),
      docs: await prisma.document.count(),
      links: await prisma.stepDocument.count(),
      tips: await prisma.tip.count(),
    }).toEqual(before);
  });

  it('never overwrites an admin edit or resets a verified flag', async () => {
    await seedDatabase(prisma);
    const step = await prisma.step.findFirstOrThrow({ where: { title: 'Register the death' } });
    const when = new Date('2026-09-01T00:00:00Z');
    await prisma.step.update({
      where: { id: step.id },
      data: {
        title: 'Register the death (edited)',
        fee: 'Edited fee',
        verified: true,
        lastVerifiedAt: when,
      },
    });
    await seedDatabase(prisma);
    const after = await prisma.step.findUniqueOrThrow({ where: { id: step.id } });
    expect(after).toMatchObject({
      title: 'Register the death (edited)',
      fee: 'Edited fee',
      verified: true,
    });
    expect(after.lastVerifiedAt?.toISOString()).toBe(when.toISOString());
  });

  it('only seeds the events that are missing', async () => {
    await seedDatabase(
      prisma,
      SEED_EVENTS.filter((e) => e.slug === 'death'),
    );
    const result = await seedDatabase(prisma);
    expect(result.created.sort()).toEqual(['biz', 'move']);
    expect(result.skipped).toEqual(['death']);
  });
});

describe('database constraints', () => {
  it('rejects a step that depends on itself', async () => {
    await seedDatabase(prisma);
    const step = await prisma.step.findFirstOrThrow();
    await expect(
      prisma.stepDependency.create({ data: { stepId: step.id, dependsOnId: step.id } }),
    ).rejects.toThrow();
  });

  it('rejects a deadline with an amount but no unit', async () => {
    await seedDatabase(prisma);
    const step = await prisma.step.findFirstOrThrow({ where: { dueAmount: null } });
    await expect(
      prisma.step.update({ where: { id: step.id }, data: { dueAmount: 5 } }),
    ).rejects.toThrow();
  });

  it('rejects a tip that targets neither or both of a step and an office', async () => {
    await seedDatabase(prisma);
    const step = await prisma.step.findFirstOrThrow();
    const office = await prisma.office.findFirstOrThrow();
    await expect(prisma.tip.create({ data: { body: 'orphan' } })).rejects.toThrow();
    await expect(
      prisma.tip.create({ data: { body: 'both', stepId: step.id, officeId: office.id } }),
    ).rejects.toThrow();
  });

  it('rejects reminders opt-in without an email address', async () => {
    await seedDatabase(prisma);
    const event = await prisma.event.findFirstOrThrow();
    await expect(
      prisma.case.create({
        data: { eventId: event.id, tokenHash: 'h1', remindersOptIn: true, reminderEmail: null },
      }),
    ).rejects.toThrow();
  });

  it('keeps done_at in step with status', async () => {
    await seedDatabase(prisma);
    const event = await prisma.event.findFirstOrThrow();
    const step = await prisma.step.findFirstOrThrow({ where: { eventId: event.id } });
    const c = await prisma.case.create({ data: { eventId: event.id, tokenHash: 'h2' } });
    await expect(
      prisma.caseStep.create({
        data: { caseId: c.id, stepId: step.id, status: 'DONE', doneAt: null },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.caseStep.create({
        data: { caseId: c.id, stepId: step.id, status: 'PENDING', doneAt: new Date() },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.caseStep.create({
        data: { caseId: c.id, stepId: step.id, status: 'DONE', doneAt: new Date() },
      }),
    ).resolves.toBeDefined();
  });
});
