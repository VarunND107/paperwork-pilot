import { Router } from 'express';
import { requireAdmin } from '../admin/auth.js';
import {
  dependenciesPut,
  dependencyAdd,
  dependencyRemove,
  documentCreate,
  documentPatch,
  eventCreate,
  eventPatch,
  loginBody,
  officeCreate,
  officePatch,
  stepCreate,
  stepDocumentsPut,
  stepPatch,
} from '../admin/schemas.js';
import {
  ADMIN_COOKIE,
  createAdminSession,
  parseCookies,
  passwordMatches,
  SESSION_TTL_MS,
  verifyAdminSession,
} from '../admin/session.js';
import * as admin from '../admin/service.js';
import { HttpError } from '../errors.js';
import type { AppContext } from './context.js';
import { idParam } from './schemas.js';

/**
 * The admin panel API. Protected by ADMIN_PASSWORD (a signed httpOnly cookie after login).
 * Every write must carry a `sourceUrl` and sets last_verified_at; see admin/schemas.ts.
 */
export function adminRouter(ctx: AppContext): Router {
  const router = Router();
  const { prisma, clock, config } = ctx;

  router.use('/admin', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  // ---- session (no login needed to ask) ---------------------------------------------------

  router.get('/admin/session', (req, res) => {
    const cookie = parseCookies(req.headers.cookie)[ADMIN_COOKIE];
    res.json({
      enabled: config.adminPassword !== '',
      authenticated:
        config.adminPassword !== '' && verifyAdminSession(config.sessionSecret, cookie, clock()),
    });
  });

  router.post('/admin/login', ctx.limiters.adminLogin, (req, res) => {
    if (!config.adminPassword) {
      throw new HttpError(
        503,
        'admin_disabled',
        'The admin panel is switched off. Set ADMIN_PASSWORD to turn it on.',
      );
    }
    const { password } = loginBody.parse(req.body);
    if (!passwordMatches(config.adminPassword, password, config.sessionSecret)) {
      throw new HttpError(401, 'invalid_password', 'That password is not right.');
    }
    res.cookie(ADMIN_COOKIE, createAdminSession(config.sessionSecret, clock()), {
      httpOnly: true,
      sameSite: 'strict',
      secure: req.secure,
      path: '/',
      maxAge: SESSION_TTL_MS,
    });
    res.json({ ok: true });
  });

  router.post('/admin/logout', (_req, res) => {
    res.clearCookie(ADMIN_COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  // ---- everything below needs a session ----------------------------------------------------

  router.use('/admin', requireAdmin(config, clock));

  // Events
  router.get('/admin/events', async (_req, res) => {
    res.json({ events: await admin.listEvents(prisma, clock()) });
  });
  router.post('/admin/events', async (req, res) => {
    const body = eventCreate.parse(req.body);
    res.status(201).json({ event: await admin.createEvent(prisma, body, clock()) });
  });
  router.get('/admin/events/:id', async (req, res) => {
    res.json(await admin.getEventDetail(prisma, idParam.parse(req.params.id), clock()));
  });
  router.patch('/admin/events/:id', async (req, res) => {
    const body = eventPatch.parse(req.body);
    res.json({
      event: await admin.updateEvent(prisma, idParam.parse(req.params.id), body, clock()),
    });
  });
  router.delete('/admin/events/:id', async (req, res) => {
    await admin.deleteEvent(prisma, idParam.parse(req.params.id));
    res.status(204).end();
  });

  // Steps
  router.post('/admin/events/:id/steps', async (req, res) => {
    const body = stepCreate.parse(req.body);
    const step = await admin.createStep(prisma, idParam.parse(req.params.id), body, clock());
    res.status(201).json({ step });
  });
  router.get('/admin/steps/:id', async (req, res) => {
    res.json(await admin.getStep(prisma, idParam.parse(req.params.id), clock()));
  });
  router.patch('/admin/steps/:id', async (req, res) => {
    const body = stepPatch.parse(req.body);
    res.json({ step: await admin.updateStep(prisma, idParam.parse(req.params.id), body, clock()) });
  });
  router.delete('/admin/steps/:id', async (req, res) => {
    await admin.deleteStep(prisma, idParam.parse(req.params.id));
    res.status(204).end();
  });

  // Dependencies: "this step needs that step". A cycle is refused with the path that causes it.
  router.put('/admin/steps/:id/dependencies', async (req, res) => {
    const { needs, ...provenance } = dependenciesPut.parse(req.body);
    const step = await admin.setDependencies(
      prisma,
      idParam.parse(req.params.id),
      needs,
      provenance,
      clock(),
    );
    res.json({ step });
  });
  router.post('/admin/steps/:id/dependencies', async (req, res) => {
    const { dependsOnId, ...provenance } = dependencyAdd.parse(req.body);
    const step = await admin.addDependency(
      prisma,
      idParam.parse(req.params.id),
      dependsOnId,
      provenance,
      clock(),
    );
    res.status(201).json({ step });
  });
  router.delete('/admin/steps/:id/dependencies/:dependsOnId', async (req, res) => {
    const provenance = dependencyRemove.parse(req.body);
    const step = await admin.removeDependency(
      prisma,
      idParam.parse(req.params.id),
      idParam.parse(req.params.dependsOnId),
      provenance,
      clock(),
    );
    res.json({ step });
  });

  // Documents a step asks for or hands over
  router.put('/admin/steps/:id/documents', async (req, res) => {
    const { rows, ...provenance } = stepDocumentsPut.parse(req.body);
    const step = await admin.setStepDocuments(
      prisma,
      idParam.parse(req.params.id),
      rows,
      provenance,
      clock(),
    );
    res.json({ step });
  });

  // Document catalog
  router.get('/admin/documents', async (_req, res) => {
    res.json({ documents: await admin.listDocuments(prisma, clock()) });
  });
  router.post('/admin/documents', async (req, res) => {
    const body = documentCreate.parse(req.body);
    res.status(201).json({ document: await admin.createDocument(prisma, body, clock()) });
  });
  router.patch('/admin/documents/:id', async (req, res) => {
    const body = documentPatch.parse(req.body);
    res.json({
      document: await admin.updateDocument(prisma, idParam.parse(req.params.id), body, clock()),
    });
  });
  router.delete('/admin/documents/:id', async (req, res) => {
    await admin.deleteDocument(prisma, idParam.parse(req.params.id));
    res.status(204).end();
  });

  // Offices and portals
  router.get('/admin/offices', async (_req, res) => {
    res.json({ offices: await admin.listOffices(prisma, clock()) });
  });
  router.post('/admin/offices', async (req, res) => {
    const body = officeCreate.parse(req.body);
    res.status(201).json({ office: await admin.createOffice(prisma, body, clock()) });
  });
  router.patch('/admin/offices/:id', async (req, res) => {
    const body = officePatch.parse(req.body);
    res.json({
      office: await admin.updateOffice(prisma, idParam.parse(req.params.id), body, clock()),
    });
  });
  router.delete('/admin/offices/:id', async (req, res) => {
    await admin.deleteOffice(prisma, idParam.parse(req.params.id));
    res.status(204).end();
  });

  return router;
}
