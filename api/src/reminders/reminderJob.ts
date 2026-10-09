import type { Config } from '../config.js';
import { type Db, Prisma } from '../db.js';
import { indiaToday } from '../engine/dates.js';
import { isDueWithin } from '../engine/deadlines.js';
import type { EmailProvider } from '../email/provider.js';
import { unsubscribeUrl } from '../security/unsubscribe.js';
import { loadCaseBundle } from '../services/cases.js';
import { caseEventDate, computeRoute } from '../services/views.js';
import { composeReminder, type DueStep } from './message.js';

/** A reminder goes out when a step's deadline is today or within this many days. */
export const REMINDER_WINDOW_DAYS = 3;
const DEFAULT_PAGE = 100;

export interface ReminderDeps {
  prisma: Db;
  email: EmailProvider;
  config: Pick<Config, 'publicUrl' | 'sessionSecret'>;
  /** The current instant. */
  now: Date;
  /** Log lines about failures. Defaults to console.error. */
  logError?: (message: string, error: unknown) => void;
  /** How many cases to load at a time. */
  pageSize?: number;
}

export interface ReminderSummary {
  casesChecked: number;
  emailsSent: number;
  stepsReminded: number;
  failures: number;
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/**
 * Finds cases that opted in to reminders and have a step, not yet done, whose deadline is today or
 * in the next 3 days, and sends ONE email per case listing those steps through the EmailProvider.
 *
 * A step is reminded at most once per deadline date. Each (case, step, deadline) is claimed in
 * `reminder_logs` BEFORE sending (the unique key makes concurrent runs safe); if sending fails the
 * claim is released so the next run tries again.
 */
export async function runReminders(deps: ReminderDeps): Promise<ReminderSummary> {
  const { prisma, config, now } = deps;
  const logError = deps.logError ?? ((m, e) => console.error(m, e));
  const today = indiaToday(now);
  const pageSize = deps.pageSize ?? DEFAULT_PAGE;
  const summary: ReminderSummary = {
    casesChecked: 0,
    emailsSent: 0,
    stepsReminded: 0,
    failures: 0,
  };

  let cursor: string | undefined;
  for (;;) {
    const page = await prisma.case.findMany({
      where: { remindersOptIn: true, reminderEmail: { not: null }, eventDate: { not: null } },
      orderBy: { id: 'asc' },
      take: pageSize,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, reminderEmail: true },
    });
    if (page.length === 0) break;
    cursor = page[page.length - 1]?.id;

    for (const row of page) {
      summary.casesChecked++;
      try {
        const sent = await remindOneCase(deps, row.id, row.reminderEmail ?? '', today, config);
        if (sent > 0) {
          summary.emailsSent++;
          summary.stepsReminded += sent;
        }
      } catch (error) {
        summary.failures++;
        logError(`Reminder for case ${row.id} failed`, error);
      }
    }
    if (page.length < pageSize) break;
  }
  return summary;
}

/** Returns how many steps were reminded (0 when nothing was due or already reminded). */
async function remindOneCase(
  deps: ReminderDeps,
  caseId: string,
  to: string,
  today: string,
  config: Pick<Config, 'publicUrl' | 'sessionSecret'>,
): Promise<number> {
  const { prisma, email, now } = deps;
  const { row, def, state } = await loadCaseBundle(prisma, caseId);
  const eventDate = caseEventDate(row);
  if (!eventDate || !row.remindersOptIn) return 0;

  const route = computeRoute(def, state, eventDate, now);
  const titleOf = (id: string) => def.steps.find((s) => s.id === id)?.title ?? '';
  const due = route.steps.filter(
    (s) =>
      s.status !== 'done' &&
      s.deadline !== null &&
      isDueWithin(s.deadline, today, REMINDER_WINDOW_DAYS),
  );
  if (due.length === 0) return 0;

  // Claim each (case, step, deadline) so it is reminded once, even if two runs overlap.
  const claimed: typeof due = [];
  for (const step of due) {
    if (step.deadline === null) continue;
    try {
      await prisma.reminderLog.create({
        data: {
          caseId,
          stepId: step.id,
          dueDate: new Date(`${step.deadline}T00:00:00.000Z`),
          email: to,
        },
      });
      claimed.push(step);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
    }
  }
  if (claimed.length === 0) return 0;

  const steps: DueStep[] = claimed.map((s) => ({
    title: titleOf(s.id),
    deadline: s.deadline ?? today,
    daysLeft: s.daysLeft ?? 0,
    waitsFor: s.blockedBy.map(titleOf),
  }));
  const message = composeReminder({
    eventLabel: def.event.label,
    eventDateLabel: def.event.eventDateLabel,
    eventDate,
    steps,
    caseUrl: `${config.publicUrl}/case/${caseId}`,
    unsubscribeUrl: unsubscribeUrl(config.publicUrl, caseId, config.sessionSecret),
  });

  try {
    await email.send({ to, ...message });
  } catch (error) {
    // Not sent: release the claims so the next run tries again.
    await prisma.reminderLog.deleteMany({
      where: {
        caseId,
        stepId: { in: claimed.map((s) => s.id) },
        dueDate: { in: claimed.map((s) => new Date(`${s.deadline ?? today}T00:00:00.000Z`)) },
      },
    });
    throw error;
  }
  return claimed.length;
}
