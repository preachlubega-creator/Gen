import { Router } from 'express';
import { desc, eq } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { auditLogs, sectors } from '../../db/schema.ts';
import { requireAuth, requirePermission, type AuthRequest } from '../middleware/auth.ts';

export async function recordAuditLog(params: {
  actorUserId?: number | null;
  actorEmail: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string | number;
  sectorId?: number | null;
  summary: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    await db.insert(auditLogs).values({
      actorUserId: params.actorUserId ?? null,
      actorEmail: params.actorEmail,
      actorRole: params.actorRole,
      action: params.action,
      entityType: params.entityType,
      entityId: String(params.entityId),
      sectorId: params.sectorId ?? null,
      summary: params.summary,
      metadataJson: JSON.stringify(params.metadata ?? {}),
    });
  } catch (error) {
    console.error('Failed to record audit log:', error);
    throw new Error('Failed to record audit trail.', { cause: error });
  }
}

export const auditRouter = Router();

auditRouter.get(
  '/',
  requireAuth,
  requirePermission('audit.view'),
  async (req: AuthRequest, res) => {
    try {
      const entityType = typeof req.query.entityType === 'string' ? req.query.entityType : '';
      const sectorIdParam = typeof req.query.sectorId === 'string' ? Number(req.query.sectorId) : null;
      const limit = Math.min(200, Math.max(10, Number(req.query.limit) || 100));

      const rows = await db
        .select({
          id: auditLogs.id,
          actorEmail: auditLogs.actorEmail,
          actorRole: auditLogs.actorRole,
          action: auditLogs.action,
          entityType: auditLogs.entityType,
          entityId: auditLogs.entityId,
          sectorId: auditLogs.sectorId,
          sectorName: sectors.name,
          summary: auditLogs.summary,
          metadataJson: auditLogs.metadataJson,
          createdAt: auditLogs.createdAt,
        })
        .from(auditLogs)
        .leftJoin(sectors, eq(auditLogs.sectorId, sectors.id))
        .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
        .limit(limit);

      const filtered = rows.filter((row) => {
        if (entityType && row.entityType !== entityType) return false;
        if (sectorIdParam && row.sectorId !== sectorIdParam) return false;
        return true;
      });

      res.json({
        logs: filtered.map((r) => ({
          ...r,
          createdAt: r.createdAt.toISOString(),
        })),
      });
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      res.status(500).json({ error: 'Unable to load audit logs.' });
    }
  }
);
