import type { Request, Response, NextFunction } from 'express';
import { count, eq } from 'drizzle-orm';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { adminAuth } from '../../lib/firebase-admin.ts';
import { db } from '../../db/index.ts';
import {
  members,
  memberSectorRoles,
  permissions,
  rolePermissions,
  roles,
  sectors,
  users,
} from '../../db/schema.ts';
import type { UserAccessContext } from '../../domain/types.ts';
import { hasPermission } from '../../domain/calculations.ts';
import { ensureSeeded } from '../seed.ts';

export interface AuthRequest extends Request {
  firebaseUser?: DecodedIdToken;
  access?: UserAccessContext;
}

const FOUNDER_EMAILS = new Set(['preachlubega@gmail.com']);

async function getOrCreateUserAndAccess(decoded: DecodedIdToken): Promise<UserAccessContext> {
  await ensureSeeded();

  const email = (decoded.email ?? `${decoded.uid}@unknown.local`).toLowerCase();
  const displayName = decoded.name ?? email.split('@')[0];
  const photoUrl = decoded.picture ?? '';

  let [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.uid, decoded.uid))
    .limit(1);

  if (!existingUser) {
    const [{ value: userCount }] = await db.select({ value: count() }).from(users);
    const shouldBeFounder =
      FOUNDER_EMAILS.has(email) || Number(userCount) === 0;

    const [inserted] = await db
      .insert(users)
      .values({
        uid: decoded.uid,
        email,
        displayName,
        photoUrl,
        globalRoleSlug: shouldBeFounder ? 'founder' : 'member',
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email,
          displayName,
          photoUrl,
        },
      })
      .returning();
    existingUser = inserted;
  }

  // Link to pre-registered member profile by email if not linked yet
  let [memberRow] = await db
    .select()
    .from(members)
    .where(eq(members.email, email))
    .limit(1);

  if (memberRow && memberRow.userId !== existingUser.id) {
    await db
      .update(members)
      .set({ userId: existingUser.id })
      .where(eq(members.id, memberRow.id));
  }

  if (!memberRow) {
    const [byUid] = await db
      .select()
      .from(members)
      .where(eq(members.userId, existingUser.id))
      .limit(1);
    memberRow = byUid;
  }

  const allRoles = await db.select().from(roles);
  const allPerms = await db.select().from(permissions);
  const allRolePerms = await db.select().from(rolePermissions);

  const permKeyById = new Map(allPerms.map((p) => [p.id, p.key]));
  const permKeysByRoleId = new Map<number, string[]>();
  for (const rp of allRolePerms) {
    const key = permKeyById.get(rp.permissionId);
    if (!key) continue;
    const arr = permKeysByRoleId.get(rp.roleId) ?? [];
    arr.push(key);
    permKeysByRoleId.set(rp.roleId, arr);
  }

  const roleBySlug = new Map(allRoles.map((r) => [r.slug, r]));
  const roleById = new Map(allRoles.map((r) => [r.id, r]));

  const globalRole = roleBySlug.get(existingUser.globalRoleSlug) ?? roleBySlug.get('member');
  const globalPermissionKeys = globalRole
    ? permKeysByRoleId.get(globalRole.id) ?? []
    : [];

  const isGlobalAdmin =
    existingUser.globalRoleSlug === 'founder' ||
    existingUser.globalRoleSlug === 'admin';

  let sectorRoles: UserAccessContext['sectorRoles'] = [];
  if (memberRow) {
    const assignments = await db
      .select({
        sectorId: memberSectorRoles.sectorId,
        sectorSlug: sectors.slug,
        roleId: memberSectorRoles.roleId,
      })
      .from(memberSectorRoles)
      .innerJoin(sectors, eq(memberSectorRoles.sectorId, sectors.id))
      .where(eq(memberSectorRoles.memberId, memberRow.id));

    sectorRoles = assignments.map((a) => {
      const r = roleById.get(a.roleId);
      return {
        sectorId: a.sectorId,
        sectorSlug: a.sectorSlug,
        roleSlug: r?.slug ?? 'member',
        permissionKeys: r ? permKeysByRoleId.get(r.id) ?? [] : [],
      };
    });
  }

  return {
    userId: existingUser.id,
    uid: existingUser.uid,
    email: existingUser.email,
    displayName: existingUser.displayName || existingUser.email,
    globalRoleSlug: existingUser.globalRoleSlug,
    isGlobalAdmin,
    memberId: memberRow?.id ?? null,
    globalPermissionKeys,
    sectorRoles,
  };
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    req.firebaseUser = decoded;
    req.access = await getOrCreateUserAndAccess(decoded);
    next();
  } catch (error) {
    console.error('Auth verification failed:', error);
    res.status(401).json({ error: 'Invalid or expired authentication token.' });
  }
};

export function requirePermission(
  permissionKey: string,
  resolveSectorId?: (req: AuthRequest) => number | null
) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const sectorId = resolveSectorId ? resolveSectorId(req) : null;
    if (!hasPermission(req.access, permissionKey, sectorId)) {
      res.status(403).json({
        error: 'Insufficient permissions for this action.',
        requiredPermission: permissionKey,
      });
      return;
    }
    next();
  };
}
