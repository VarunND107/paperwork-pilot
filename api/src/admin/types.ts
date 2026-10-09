/** JSON shapes of the admin API. The web admin keeps a copy in web/src/admin/types.ts. */

export interface Provenance {
  sourceUrl: string | null;
  /** ISO timestamp of the last admin edit or verification, null if never. */
  lastVerifiedAt: string | null;
  verified: boolean;
  /** Never verified, or last verified more than 90 days ago. */
  stale: boolean;
}

export interface AdminEventRow extends Provenance {
  id: string;
  slug: string;
  label: string;
  place: string;
  eventDateLabel: string;
  keywords: string[];
  position: number;
  stepCount: number;
  staleStepCount: number;
  unverifiedStepCount: number;
  caseCount: number;
}

export interface AdminStepDocument {
  id: string;
  documentId: string;
  documentName: string;
  role: 'REQUIRES' | 'PRODUCES';
  producedByStepId: string | null;
  label: string | null;
  position: number;
}

export interface AdminStepRow extends Provenance {
  id: string;
  eventId: string;
  position: number;
  title: string;
  form: string;
  whereText: string;
  officeId: string | null;
  officeName: string | null;
  fee: string;
  waitText: string;
  dueText: string;
  dueAmount: number | null;
  dueUnit: 'DAY' | 'WEEK' | 'MONTH' | null;
  needs: { id: string; title: string }[];
  documents: AdminStepDocument[];
  updatedAt: string;
  /** Always a string for steps (it is required in the database). */
  sourceUrl: string;
}

export interface AdminDocumentRow extends Provenance {
  id: string;
  name: string;
  description: string | null;
  stepCount: number;
  caseCount: number;
}

export interface AdminOfficeRow extends Provenance {
  id: string;
  name: string;
  kind: 'OFFICE' | 'PORTAL';
  city: string;
  address: string | null;
  url: string | null;
  hours: string | null;
  stepCount: number;
}

export type TipFilter = 'queue' | 'pending' | 'flagged' | 'approved' | 'rejected' | 'all';

export interface AdminTipRow {
  id: string;
  body: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  origin: 'SEED' | 'USER';
  createdAt: string;
  moderatedAt: string | null;
  /** How many browsers said this tip looks out of date. */
  flagCount: number;
  /** What the tip is about, in words a moderator recognises. */
  target: { kind: 'step' | 'office'; id: string; label: string; context: string | null };
}

export interface AdminTipList {
  tips: AdminTipRow[];
  /** Waiting for a first review, and approved tips that visitors flagged. */
  counts: { pending: number; flagged: number };
}
