import { Router } from 'express';
import { asc, eq } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import {
  financialTransactions,
  memberSectorRoles,
  projects,
  sectors,
} from '../../db/schema.ts';
import { computeLedgerSummary } from '../../domain/calculations.ts';
import {
  requireAuth,
  requirePermission,
  type AuthRequest,
} from '../middleware/auth.ts';
import { ensureSeeded } from '../seed.ts';
import { recordAuditLog } from './audit.ts';

export const sectorsRouter = Router();

sectorsRouter.get('/', requireAuth, async (_req: AuthRequest, res) => {
  try {
    await ensureSeeded();
    const sectorRows = await db.select().from(sectors).orderBy(asc(sectors.id));
    const roleAssignments = await db.select().from(memberSectorRoles);
    const projectRows = await db.select().from(projects);
    const txRows = await db.select().from(financialTransactions);

    const memberCountsBySector: Record<number, number> = {};
    for (const a of roleAssignments) {
      memberCountsBySector[a.sectorId] = (memberCountsBySector[a.sectorId] ?? 0) + 1;
    }

    const projectCountsBySector: Record<number, number> = {};
    for (const p of projectRows) {
      projectCountsBySector[p.sectorId] = (projectCountsBySector[p.sectorId] ?? 0) + 1;
    }

    const financeSummary = computeLedgerSummary(
      txRows,
      sectorRows,
      memberCountsBySector
    );

    const enriched = sectorRows.map((s) => {
      const fin = financeSummary.sectorBreakdown.find((b) => b.sectorId === s.id);
      return {
        ...s,
        memberCount: memberCountsBySector[s.id] ?? 0,
        projectCount: projectCountsBySector[s.id] ?? 0,
        finance: fin ?? null,
      };
    });

    res.json({ sectors: enriched });
  } catch (error) {
    console.error('Failed to load sectors:', error);
    res.status(500).json({ error: 'Unable to load sectors.' });
  }
});

sectorsRouter.post(
  '/',
  requireAuth,
  requirePermission('rbac.manage'),
  async (req: AuthRequest, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const description =
      typeof req.body?.description === 'string' ? req.body.description.trim() : '';
    const focusArea =
      typeof req.body?.focusArea === 'string' ? req.body.focusArea.trim() : '';

    if (name.length < 2 || description.length < 5) {
      res
        .status(400)
        .json({ error: 'Sector name and description are required.' });
      return;
    }

    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');

    try {
      const [existing] = await db
        .select()
        .from(sectors)
        .where(eq(sectors.slug, slug))
        .limit(1);
      if (existing) {
        res.status(409).json({ error: 'A sector with this name already exists.' });
        return;
      }

      const [created] = await db
        .insert(sectors)
        .values({
          slug,
          name,
          description,
          focusArea: focusArea || 'Custom sector operations',
          isActive: true,
        })
        .returning();

      await recordAuditLog({
        actorUserId: req.access!.userId,
        actorEmail: req.access!.email,
        actorRole: req.access!.globalRoleSlug,
        action: 'SECTOR_CREATED',
        entityType: 'sector',
        entityId: created.id,
        sectorId: created.id,
        summary: `Created new organisational sector "${created.name}".`,
      });

      res.status(201).json({ sector: created });
    } catch (error) {
      console.error('Failed to create sector:', error);
      res.status(500).json({ error: 'Unable to create sector.' });
    }
  }
);
