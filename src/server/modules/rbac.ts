import { Router } from 'express';
import { asc, desc, eq, inArray } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { permissions, rolePermissions, roles } from '../../db/schema.ts';
import {
  requireAuth,
  requirePermission,
  type AuthRequest,
} from '../middleware/auth.ts';
import { recordAuditLog } from './audit.ts';

export const rbacRouter = Router();

rbacRouter.get('/', requireAuth, async (_req: AuthRequest, res) => {
  try {
    const allRoles = await db.select().from(roles).orderBy(desc(roles.rank));
    const allPerms = await db
      .select()
      .from(permissions)
      .orderBy(asc(permissions.module), asc(permissions.id));
    const mappings = await db.select().from(rolePermissions);

    const permKeyById = new Map(allPerms.map((p) => [p.id, p.key]));
    const keysByRole = new Map<number, string[]>();
    for (const m of mappings) {
      const k = permKeyById.get(m.permissionId);
      if (!k) continue;
      const arr = keysByRole.get(m.roleId) ?? [];
      arr.push(k);
      keysByRole.set(m.roleId, arr);
    }

    res.json({
      roles: allRoles.map((r) => ({
        id: r.id,
        slug: r.slug,
        name: r.name,
        description: r.description,
        rank: r.rank,
        isSystem: r.isSystem,
        permissionKeys: keysByRole.get(r.id) ?? [],
      })),
      permissions: allPerms,
    });
  } catch (error) {
    console.error('Failed to load RBAC matrix:', error);
    res.status(500).json({ error: 'Unable to load roles and permissions.' });
  }
});

rbacRouter.put(
  '/roles/:roleId/permissions',
  requireAuth,
  requirePermission('rbac.manage'),
  async (req: AuthRequest, res) => {
    const roleId = Number(req.params.roleId);
    const permissionKeys = Array.isArray(req.body?.permissionKeys)
      ? req.body.permissionKeys.filter((k: unknown): k is string => typeof k === 'string')
      : null;

    if (!Number.isInteger(roleId) || !permissionKeys) {
      res.status(400).json({ error: 'Valid roleId and permissionKeys array required.' });
      return;
    }

    try {
      const [roleRow] = await db
        .select()
        .from(roles)
        .where(eq(roles.id, roleId))
        .limit(1);
      if (!roleRow) {
        res.status(404).json({ error: 'Role not found.' });
        return;
      }

      // Founder always retains rbac.manage to prevent admin lockout
      const effectiveKeys = new Set<string>(permissionKeys);
      if (roleRow.slug === 'founder') {
        effectiveKeys.add('rbac.manage');
        effectiveKeys.add('audit.view');
      }

      const permRows =
        effectiveKeys.size > 0
          ? await db
              .select()
              .from(permissions)
              .where(inArray(permissions.key, Array.from(effectiveKeys)))
          : [];

      await db.transaction(async (tx) => {
        await tx
          .delete(rolePermissions)
          .where(eq(rolePermissions.roleId, roleId));
        if (permRows.length > 0) {
          await tx.insert(rolePermissions).values(
            permRows.map((p) => ({
              roleId,
              permissionId: p.id,
            }))
          );
        }
      });

      await recordAuditLog({
        actorUserId: req.access!.userId,
        actorEmail: req.access!.email,
        actorRole: req.access!.globalRoleSlug,
        action: 'RBAC_PERMISSIONS_UPDATED',
        entityType: 'role',
        entityId: roleRow.id,
        summary: `Updated ${permRows.length} permissions for role "${roleRow.name}".`,
        metadata: { roleSlug: roleRow.slug, permissionKeys: permRows.map((p) => p.key) },
      });

      res.json({
        roleId,
        permissionKeys: permRows.map((p) => p.key),
      });
    } catch (error) {
      console.error('Failed to update role permissions:', error);
      res.status(500).json({ error: 'Unable to update role permissions.' });
    }
  }
);
