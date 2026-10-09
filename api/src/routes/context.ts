import type { Config } from '../config.js';
import type { Db } from '../db.js';
import type { Limiters } from '../http/limits.js';

/** What every router needs. Passed in, never imported, so tests can swap the clock and database. */
export interface AppContext {
  config: Config;
  prisma: Db;
  /** The current instant. Tests fix it. */
  clock: () => Date;
  limiters: Limiters;
}
