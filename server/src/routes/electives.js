import { Router } from 'express';
import { z } from 'zod';
import { authenticate, allow } from '../middleware/auth.js';
import { Subject, User } from '../models/index.js';
import { chooseElective, electiveGroupsFor } from '../services/electives.js';
import { audit } from '../utils/audit.js';
import { httpError, oid, send, wrap } from '../utils/http.js';

const router = Router();

router.get(
  '/me/electives',
  authenticate,
  allow('student'),
  wrap(async (req, res) => send(res, await electiveGroupsFor(req.user))),
);

router.post(
  '/me/electives',
  authenticate,
  allow('student'),
  wrap(async (req, res) => {
    const { subjectId } = z.object({ subjectId: z.string().refine(oid, 'Invalid subject') }).parse(req.body);
    const result = await chooseElective(req.user, subjectId);
    await audit(req, 'ELECTIVE_CHOSEN', 'Subject', subjectId, { group: result.group });
    send(res, result);
  }),
);

router.get(
  '/admin/electives',
  authenticate,
  allow('admin'),
  wrap(async (req, res) => {
    const [groups, students] = await Promise.all([
      electiveGroupsFor(req.user),
      User.find({ role: 'student', isActive: true }).select('_id').lean(),
    ]);
    send(
      res,
      groups.map((g) => {
        const chosen = g.options.reduce((n, o) => n + o.students, 0);
        return {
          ...g,
          choice: undefined,
          students: students.length,
          unchosen: Math.max(0, students.length - chosen),
        };
      }),
    );
  }),
);

router.post(
  '/admin/electives/:group/:action',
  authenticate,
  allow('admin'),
  wrap(async (req, res) => {
    const { group, action } = z
      .object({ group: z.string().min(1).max(4), action: z.enum(['lock', 'unlock']) })
      .parse(req.params);
    const r = await Subject.updateMany(
      { electiveGroup: group.toUpperCase(), archivedAt: null },
      action === 'lock' ? { $set: { electiveLockedAt: new Date() } } : { $unset: { electiveLockedAt: 1 } },
    );
    if (!r.matchedCount) throw httpError(404, 'No such elective group');
    await audit(req, action === 'lock' ? 'ELECTIVES_LOCKED' : 'ELECTIVES_UNLOCKED', 'Subject', null, {
      group: group.toUpperCase(),
    });
    send(res, { group: group.toUpperCase(), locked: action === 'lock' });
  }),
);

export default router;
