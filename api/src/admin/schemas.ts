import { z } from 'zod';

/**
 * Only http(s) links. Source URLs end up as links on public pages, so `javascript:`, `data:` and
 * friends must never get in.
 */
export const httpUrl = z
  .string()
  .trim()
  .max(2048)
  .pipe(
    z.url({ protocol: /^https?$/, message: 'Enter a full web address starting with https://' }),
  );

const id = z.string().min(1).max(100);
const text = (max: number) => z.string().trim().min(1).max(max);

/**
 * Every admin edit says where the information came from and whether the editor checked it.
 * The server sets last_verified_at to "now" on every accepted edit.
 */
export const provenance = {
  sourceUrl: httpUrl,
  /** "I checked this against the source." Defaults to false: editing never verifies by accident. */
  verified: z.boolean().default(false),
};

const dueFields = {
  dueAmount: z.int().min(0).max(3650).nullable(),
  dueUnit: z.enum(['DAY', 'WEEK', 'MONTH']).nullable(),
};
const dueBothOrNeither = (v: { dueAmount?: number | null; dueUnit?: string | null }) =>
  (v.dueAmount === undefined) === (v.dueUnit === undefined) &&
  (v.dueAmount === null) === (v.dueUnit === null);
const dueMessage = 'Give both an amount and a unit for the deadline, or neither.';

// ---- events -------------------------------------------------------------------------------

const eventBase = {
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .max(60)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use lower-case letters, digits and hyphens.'),
  label: text(120),
  place: text(120),
  eventDateLabel: text(60),
  keywords: z.array(z.string().trim().min(1).max(60)).max(100),
  position: z.int().min(0).max(1000),
};

export const eventCreate = z.strictObject({
  ...eventBase,
  place: eventBase.place.default('Bengaluru, Karnataka'),
  eventDateLabel: eventBase.eventDateLabel.default('Date of the event'),
  keywords: eventBase.keywords.default([]),
  position: eventBase.position.optional(),
  ...provenance,
});

export const eventPatch = z.strictObject({
  slug: eventBase.slug.optional(),
  label: eventBase.label.optional(),
  place: eventBase.place.optional(),
  eventDateLabel: eventBase.eventDateLabel.optional(),
  keywords: eventBase.keywords.optional(),
  position: eventBase.position.optional(),
  ...provenance,
});

// ---- steps --------------------------------------------------------------------------------

export const stepDocumentRow = z.strictObject({
  documentId: id,
  role: z.enum(['REQUIRES', 'PRODUCES']),
  producedByStepId: id.nullish(),
  label: text(200).nullish(),
});

const stepBase = {
  title: text(200),
  form: text(200),
  whereText: text(300),
  officeId: id.nullable(),
  fee: text(120),
  waitText: text(120),
  dueText: text(160),
  position: z.int().min(0).max(10_000),
};

export const stepCreate = z
  .strictObject({
    ...stepBase,
    officeId: stepBase.officeId.default(null),
    position: stepBase.position.optional(),
    dueAmount: dueFields.dueAmount.default(null),
    dueUnit: dueFields.dueUnit.default(null),
    needs: z.array(id).max(50).default([]),
    documents: z.array(stepDocumentRow).max(60).default([]),
    ...provenance,
  })
  .refine(dueBothOrNeither, { message: dueMessage, path: ['dueAmount'] });

export const stepPatch = z
  .strictObject({
    title: stepBase.title.optional(),
    form: stepBase.form.optional(),
    whereText: stepBase.whereText.optional(),
    officeId: stepBase.officeId.optional(),
    fee: stepBase.fee.optional(),
    waitText: stepBase.waitText.optional(),
    dueText: stepBase.dueText.optional(),
    position: stepBase.position.optional(),
    dueAmount: dueFields.dueAmount.optional(),
    dueUnit: dueFields.dueUnit.optional(),
    needs: z.array(id).max(50).optional(),
    documents: z.array(stepDocumentRow).max(60).optional(),
    ...provenance,
  })
  .refine(dueBothOrNeither, { message: dueMessage, path: ['dueAmount'] });

export const dependenciesPut = z.strictObject({ needs: z.array(id).max(50), ...provenance });
export const dependencyAdd = z.strictObject({ dependsOnId: id, ...provenance });
export const dependencyRemove = z.strictObject({ ...provenance });
export const stepDocumentsPut = z.strictObject({
  rows: z.array(stepDocumentRow).max(60),
  ...provenance,
});

// ---- documents and offices ----------------------------------------------------------------

export const documentCreate = z.strictObject({
  name: text(200),
  description: z.string().trim().max(500).nullish(),
  ...provenance,
});
export const documentPatch = z.strictObject({
  name: text(200).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  ...provenance,
});

const officeBase = {
  name: text(200),
  kind: z.enum(['OFFICE', 'PORTAL']),
  city: text(80),
  address: z.string().trim().max(300).nullable(),
  url: httpUrl.nullable(),
  hours: z.string().trim().max(200).nullable(),
};
export const officeCreate = z.strictObject({
  name: officeBase.name,
  kind: officeBase.kind.default('OFFICE'),
  city: officeBase.city.default('Bengaluru'),
  address: officeBase.address.default(null),
  url: officeBase.url.default(null),
  hours: officeBase.hours.default(null),
  ...provenance,
});
export const officePatch = z.strictObject({
  name: officeBase.name.optional(),
  kind: officeBase.kind.optional(),
  city: officeBase.city.optional(),
  address: officeBase.address.optional(),
  url: officeBase.url.optional(),
  hours: officeBase.hours.optional(),
  ...provenance,
});

export const loginBody = z.strictObject({ password: z.string().min(1).max(200) });
