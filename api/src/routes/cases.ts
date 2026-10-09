import { Router } from 'express';
import { requireCaseAccess } from '../http/caseAccess.js';
import {
  createCase,
  deleteCase,
  getCaseView,
  resetCase,
  setDocumentTicked,
  setStepDone,
  updateCaseSettings,
} from '../services/cases.js';
import type { AppContext } from './context.js';
import {
  createCaseBody,
  idParam,
  patchCaseBody,
  patchDocumentBody,
  patchStepBody,
} from './schemas.js';

export function casesRouter(ctx: AppContext): Router {
  const router = Router();
  const { prisma, clock } = ctx;

  // A case holds personal progress: never cache it.
  router.use('/cases', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  // Start a case. The response carries the secret token ONCE; the browser keeps it.
  router.post('/cases', ctx.limiters.createCase, async (req, res) => {
    const body = createCaseBody.parse(req.body);
    const { token, view } = await createCase(
      prisma,
      { eventIdOrSlug: body.eventId, eventDate: body.eventDate ?? null },
      clock(),
    );
    res.status(201).json({ token, case: view });
  });

  router.get('/cases/:id', async (req, res) => {
    const id = idParam.parse(req.params.id);
    await requireCaseAccess(prisma, req, id);
    res.json({ case: await getCaseView(prisma, id, clock()) });
  });

  // Event date and reminder settings.
  router.patch('/cases/:id', async (req, res) => {
    const id = idParam.parse(req.params.id);
    await requireCaseAccess(prisma, req, id);
    const body = patchCaseBody.parse(req.body);
    res.json({ case: await updateCaseSettings(prisma, id, body, clock()) });
  });

  // Mark a step done (`{ done: true }`) or undo it (`{ done: false }`).
  router.patch('/cases/:id/steps/:stepId', async (req, res) => {
    const id = idParam.parse(req.params.id);
    const stepId = idParam.parse(req.params.stepId);
    await requireCaseAccess(prisma, req, id);
    const { done } = patchStepBody.parse(req.body);
    const result = await setStepDone(prisma, id, stepId, done, clock());
    res.json({ case: result.view, changes: result.changes, unchanged: result.unchanged });
  });

  // Tick or untick "I have this document".
  router.patch('/cases/:id/documents/:docId', async (req, res) => {
    const id = idParam.parse(req.params.id);
    const docId = idParam.parse(req.params.docId);
    await requireCaseAccess(prisma, req, id);
    const { ticked } = patchDocumentBody.parse(req.body);
    res.json({ case: await setDocumentTicked(prisma, id, docId, ticked, clock()) });
  });

  router.post('/cases/:id/reset', async (req, res) => {
    const id = idParam.parse(req.params.id);
    await requireCaseAccess(prisma, req, id);
    res.json({ case: await resetCase(prisma, id, clock()) });
  });

  // Delete the case and everything attached to it.
  router.delete('/cases/:id', async (req, res) => {
    const id = idParam.parse(req.params.id);
    await requireCaseAccess(prisma, req, id);
    await deleteCase(prisma, id);
    res.status(204).end();
  });

  return router;
}
