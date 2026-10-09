import type { CaseHealthStatus, DateOnly } from '../engine/types.js';

/** JSON shapes of the professional-plan API. The web app keeps a copy in web/src/api/types.ts. */

export interface MemberView {
  id: string;
  name: string;
  email: string;
  role: 'OWNER' | 'MEMBER';
  createdAt: string;
}

export interface OrgView {
  id: string;
  name: string;
}

export interface ClientRow {
  /** The id of the client's case; the same id works under /cases for a signed-in member. */
  id: string;
  clientName: string;
  event: { id: string; slug: string; label: string };
  eventDate: DateOnly | null;
  startedAt: string;
  progress: { done: number; total: number };
  /** Overdue beats Needs document beats On track. */
  status: CaseHealthStatus;
  next: {
    id: string;
    number: number;
    title: string;
    deadline: DateOnly | null;
    daysLeft: number | null;
  } | null;
  /** Documents the next step still needs and the client has not ticked. */
  missingDocuments: string[];
  overdueSteps: number;
}

export interface ClientList {
  clients: ClientRow[];
  /** Over everything that matches the situation and name filters, before the status filters. */
  counts: { all: number; onTrack: number; needsDocument: number; overdue: number };
  /** Clients in the organisation, whatever the filters. */
  total: number;
  /** True when more clients matched than are listed. */
  truncated: boolean;
}
