import { Router } from 'express';
import { HttpError } from '../errors.js';
import { getClient, listClients, createClient, renameClient } from '../pro/clients.js';
import {
  addMember,
  createOrganization,
  listMembers,
  memberView,
  removeMember,
  requireMember,
  requireOwner,
  rotateKey,
} from '../pro/members.js';
import {
  addMemberBody,
  clientsQuery,
  createClientBody,
  createOrgBody,
  renameClientBody,
} from '../pro/schemas.js';
import type { AppContext } from './context.js';
import { idParam } from './schemas.js';

/**
 * The professional plan. Every route here is a 404 unless PRO_ENABLED is on. People sign in with
 * a secret access key (shown once) until email login exists; a member can open and work any case
 * of their organisation through the ordinary /cases routes with that same key.
 */
export function proRouter(ctx: AppContext): Router {
  const router = Router();
  const { prisma, clock } = ctx;

  router.use('/pro', (_req, res, next) => {
    if (!ctx.config.proEnabled) {
      next(HttpError.notFound('No such route.'));
      return;
    }
    res.set('Cache-Control', 'no-store');
    next();
  });

  // ---- organisation and team --------------------------------------------------------------

  router.post('/pro/orgs', ctx.limiters.createOrg, async (req, res) => {
    const body = createOrgBody.parse(req.body);
    res.status(201).json(await createOrganization(prisma, body));
  });

  router.get('/pro/me', async (req, res) => {
    const { member, org } = await requireMember(prisma, req);
    res.json({ member: memberView(member), org });
  });

  router.post('/pro/me/rotate-key', async (req, res) => {
    const session = await requireMember(prisma, req);
    res.json({ token: await rotateKey(prisma, session) });
  });

  router.get('/pro/members', async (req, res) => {
    const { org } = await requireMember(prisma, req);
    res.json({ members: await listMembers(prisma, org.id) });
  });

  router.post('/pro/members', async (req, res) => {
    const session = await requireMember(prisma, req);
    requireOwner(session);
    const body = addMemberBody.parse(req.body);
    res.status(201).json(await addMember(prisma, session.org.id, body));
  });

  router.delete('/pro/members/:id', async (req, res) => {
    const session = await requireMember(prisma, req);
    requireOwner(session);
    await removeMember(prisma, session, idParam.parse(req.params.id));
    res.status(204).end();
  });

  // ---- clients: the dashboard -------------------------------------------------------------

  router.get('/pro/clients', async (req, res) => {
    const { org } = await requireMember(prisma, req);
    const query = clientsQuery.parse(req.query);
    res.json(await listClients(prisma, org.id, query, clock()));
  });

  router.post('/pro/clients', async (req, res) => {
    const { org } = await requireMember(prisma, req);
    const body = createClientBody.parse(req.body);
    const client = await createClient(
      prisma,
      org.id,
      { ...body, eventDate: body.eventDate ?? null },
      clock(),
    );
    res.status(201).json({ client });
  });

  router.get('/pro/clients/:id', async (req, res) => {
    const { org } = await requireMember(prisma, req);
    res.json({ client: await getClient(prisma, org.id, idParam.parse(req.params.id), clock()) });
  });

  router.patch('/pro/clients/:id', async (req, res) => {
    const { org } = await requireMember(prisma, req);
    const { clientName } = renameClientBody.parse(req.body);
    res.json({
      client: await renameClient(prisma, org.id, idParam.parse(req.params.id), clientName, clock()),
    });
  });

  return router;
}
