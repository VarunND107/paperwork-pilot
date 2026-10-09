import cron, { type ScheduledTask } from 'node-cron';
import type { Config } from '../config.js';
import type { Db } from '../db.js';
import type { EmailProvider } from '../email/provider.js';
import { runReminders, type ReminderSummary } from './reminderJob.js';

/** Reminder times are evaluated in India, whatever time zone the server runs in. */
export const REMINDER_TIMEZONE = 'Asia/Kolkata';

export interface SchedulerDeps {
  prisma: Db;
  email: EmailProvider;
  config: Pick<Config, 'publicUrl' | 'sessionSecret' | 'reminderCron'>;
  clock?: () => Date;
  /** Called after every run. Defaults to an info line when something was sent. */
  onRun?: (summary: ReminderSummary) => void;
}

export function isValidCron(expression: string): boolean {
  return cron.validate(expression);
}

/**
 * Starts the daily reminder job (REMINDER_CRON, default 09:00 India time).
 * `noOverlap` keeps a slow run from starting a second one on top of itself.
 */
export function startReminderScheduler(deps: SchedulerDeps): ScheduledTask {
  const { config } = deps;
  if (!isValidCron(config.reminderCron)) {
    throw new Error(`REMINDER_CRON "${config.reminderCron}" is not a valid cron expression.`);
  }
  const clock = deps.clock ?? (() => new Date());
  return cron.schedule(
    config.reminderCron,
    async () => {
      const summary = await runReminders({
        prisma: deps.prisma,
        email: deps.email,
        config,
        now: clock(),
      });
      if (deps.onRun) deps.onRun(summary);
      else if (summary.emailsSent > 0 || summary.failures > 0) {
        console.info(
          `Reminders: ${summary.emailsSent} email(s) for ${summary.stepsReminded} step(s), ${summary.failures} failure(s), ${summary.casesChecked} case(s) checked`,
        );
      }
    },
    { timezone: REMINDER_TIMEZONE, name: 'paperwork-pilot-reminders', noOverlap: true },
  );
}
