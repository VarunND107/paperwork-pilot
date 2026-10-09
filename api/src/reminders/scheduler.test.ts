import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../config.js';
import { ConsoleEmailProvider, createEmailProvider } from '../email/provider.js';
import { createTestPrisma } from '../test/db.js';
import { RecordingEmail } from '../test/email.js';
import { isValidCron, REMINDER_TIMEZONE, startReminderScheduler } from './scheduler.js';

const tasks: { destroy(): void | Promise<void> }[] = [];
const prisma = createTestPrisma();

afterEach(async () => {
  for (const task of tasks.splice(0)) await task.destroy();
});

const deps = (cron: string, over: Partial<Parameters<typeof startReminderScheduler>[0]> = {}) => ({
  prisma,
  email: new RecordingEmail(),
  config: { publicUrl: 'http://localhost:8080', sessionSecret: 'x'.repeat(32), reminderCron: cron },
  ...over,
});

describe('reminder scheduler', () => {
  it('runs every day at 09:00 India time by default', () => {
    const task = startReminderScheduler(deps('0 9 * * *'));
    tasks.push(task);
    expect(REMINDER_TIMEZONE).toBe('Asia/Kolkata');
    const [first, second] = task.getNextRuns(2);
    // 09:00 in India (UTC+5:30, no daylight saving) is 03:30 UTC.
    expect(first?.getUTCHours()).toBe(3);
    expect(first?.getUTCMinutes()).toBe(30);
    expect((second?.getTime() ?? 0) - (first?.getTime() ?? 0)).toBe(86_400_000);
  });

  it('honours a different schedule', () => {
    const task = startReminderScheduler(deps('30 18 * * *'));
    tasks.push(task);
    expect(task.getNextRuns(1)[0]?.getUTCHours()).toBe(13); // 18:30 IST = 13:00 UTC
    expect(task.getNextRuns(1)[0]?.getUTCMinutes()).toBe(0);
  });

  it('runs the reminder job when it fires and reports a summary', async () => {
    const onRun = vi.fn();
    const task = startReminderScheduler(deps('0 9 * * *', { onRun }));
    tasks.push(task);
    await task.execute();
    expect(onRun).toHaveBeenCalledOnce();
    expect(onRun.mock.calls[0]?.[0]).toMatchObject({ failures: 0 });
  });

  it('refuses an invalid cron expression with a clear message', () => {
    expect(() => startReminderScheduler(deps('not a cron'))).toThrow(/not a valid cron expression/);
    expect(isValidCron('0 9 * * *')).toBe(true);
    expect(isValidCron('99 99 * * *')).toBe(false);
  });
});

describe('REMINDER_CRON in the config', () => {
  const env = { NODE_ENV: 'test', DATABASE_URL: 'postgresql://x/y' };
  it('rejects an invalid expression while reminders are on', () => {
    expect(() => loadConfig({ ...env, REMINDER_CRON: 'nonsense' })).toThrow(/REMINDER_CRON/);
  });
  it('does not care while reminders are off', () => {
    expect(() =>
      loadConfig({ ...env, REMINDERS_ENABLED: 'false', REMINDER_CRON: 'nonsense' }),
    ).not.toThrow();
  });
  it('defaults to 09:00 daily, on', () => {
    const c = loadConfig(env);
    expect(c.reminderCron).toBe('0 9 * * *');
    expect(c.remindersEnabled).toBe(true);
  });
});

describe('ConsoleEmailProvider', () => {
  it('writes the email to the log instead of sending it', async () => {
    const lines: string[] = [];
    const provider = new ConsoleEmailProvider((l) => lines.push(l));
    await provider.send({ to: 'asha@example.com', subject: 'Hello', text: 'Line one\nLine two' });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('not sent');
    expect(lines[0]).toContain('To:      asha@example.com');
    expect(lines[0]).toContain('Subject: Hello');
    expect(lines[0]).toContain('| Line two');
  });

  it('is what EMAIL_PROVIDER=console creates', () => {
    expect(createEmailProvider('console')).toBeInstanceOf(ConsoleEmailProvider);
  });
});
