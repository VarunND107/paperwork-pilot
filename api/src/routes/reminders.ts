import { Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../errors.js';
import { verifyUnsubscribeSignature } from '../security/unsubscribe.js';
import type { AppContext } from './context.js';
import { idParam } from './schemas.js';

const unsubscribeBody = z.strictObject({ caseId: idParam, sig: z.string().min(20).max(100) });

export function remindersRouter(ctx: AppContext): Router {
  const router = Router();

  // The unsubscribe link in every reminder opens a page in the web app; its button calls this.
  // It is a POST so that mail scanners that open links cannot unsubscribe anyone by accident.
  router.post('/reminders/unsubscribe', async (req, res) => {
    const { caseId, sig } = unsubscribeBody.parse(req.body);
    if (!verifyUnsubscribeSignature(caseId, sig, ctx.config.sessionSecret)) {
      throw HttpError.forbidden('This unsubscribe link is not valid.');
    }
    // Same answer whether or not the case still exists, and the address is forgotten.
    await ctx.prisma.$transaction([
      ctx.prisma.case.updateMany({
        where: { id: caseId },
        data: { remindersOptIn: false, reminderEmail: null },
      }),
      ctx.prisma.reminderLog.deleteMany({ where: { caseId } }),
    ]);
    res.json({ ok: true });
  });

  return router;
}
