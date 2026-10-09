/** A calendar date as `YYYY-MM-DD`. The engine never uses `Date` objects or the clock. */
export type DateOnly = string;

export type StepStatus = 'done' | 'ready' | 'locked';

/**
 * How a required document stands for one case.
 *  - auto:   a step that hands it over is done, so it counts as held without the user doing anything
 *  - ticked: the user said they have it
 *  - open:   the user still has to get it (and can tick it)
 *  - wait:   it comes from a step that is not done yet, so it cannot be ticked
 */
export type DocState = 'auto' | 'ticked' | 'open' | 'wait';

export type DueUnit = 'DAY' | 'WEEK' | 'MONTH';

/** "Within 21 days" is `{ amount: 21, unit: 'DAY' }`, counted from the event date. */
export interface Due {
  amount: number;
  unit: DueUnit;
}

/** The only thing the graph functions need to know about a step. */
export interface StepNode {
  id: string;
  /** Author order. Breaks ties when several steps could come next. */
  position: number;
  /** Ids of the steps that must be done before this one. */
  needs: readonly string[];
}

export type DeadlineState = 'none' | 'overdue' | 'due_soon' | 'upcoming';

export type CaseHealthStatus = 'on_track' | 'needs_document' | 'overdue';
