import { Router } from 'express';
import { asc, eq } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { roles, users } from '../../db/schema.ts';
import {
  requireAuth,
  requirePermission,
  type AuthRequest,
} from '../middleware/auth.ts';
import { recordAuditLog } from './audit.ts';

export const accountsRouter = Router();

accountsRouter.get('/me', requireAuth, async (req: AuthRequest, res) => {
  res.json({
    access: req.access,
    organisation: {
      name: 'Gen Z AgriRise',
      tagline: 'Youth Agricultural Empowerment & Operations Hub',
    },
  });
});

accountsRouter.get(
  '/users',
  requireAuth,
  requirePermission('rbac.manage'),
  async (_req: AuthRequest, res) => {
    try {
      const rows = await db
        .select({
          id: users.id,
          email: users.email,
          displayName: users.displayName,
          globalRoleSlug: users.globalRoleSlug,
          isActive: users.isActive,
          createdAt: users.createdAt,
        })
        .from(users)
        .orderBy(asc(users.id));
      res.json({
        users: rows.map((u) => ({
          ...u,
          createdAt: u.createdAt.toISOString(),
        })),
      });
    } catch (error) {
      console.error('Failed to list users:', error);
      res.status(500).json({ error: 'Unable to load system accounts.' });
    }
  }
);

accountsRouter.patch(
  '/users/:id/role',
  requireAuth,
  requirePermission('rbac.manage'),
  async (req: AuthRequest, res) => {
    const targetId = Number(req.params.id);
    const { globalRoleSlug } = req.body ?? {};
    if (!Number.isInteger(targetId) || typeof globalRoleSlug !== 'string') {
      res.status(400).json({ error: 'Valid user ID and role slug are required.' });
      return;
    }

    try {
      const [roleExists] = await db
        .select()
        .from(roles)
        .where(eq(roles.slug, globalRoleSlug))
        .limit(1);
      if (!roleExists) {
        res.status(400).json({ error: 'Specified role does not exist.' });
        return;
      }

      const [updated] = await db
        .update(users)
        .set({ globalRoleSlug })
        .where(eq(users.id, targetId))
        .returning();
      if (!updated) {
        res.status(404).json({ error: 'User account not found.' });
        return;
      }

      await recordAuditLog({
        actorUserId: req.access!.userId,
        actorEmail: req.access!.email,
        actorRole: req.access!.globalRoleSlug,
        action: 'USER_ROLE_UPDATED',
        entityType: 'user',
        entityId: updated.id,
        summary: `Updated global role of ${updated.email} to ${globalRoleSlug}.`,
        metadata: { newRole: globalRoleSlug },
      });

      res.json({ user: updated });
    } catch (error) {
      console.error('Error updating user role:', error);
      res.status(500).json({ error: 'Unable to update user role.' });
    }
  }
);
