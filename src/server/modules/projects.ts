import { Router } from 'express';
import { desc, eq } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import {
  financialTransactions,
  members,
  projectProgressLogs,
  projects,
  sectors,
  users,
} from '../../db/schema.ts';
import { hasPermission } from '../../domain/calculations.ts';
import {
  requireAuth,
  requirePermission,
  type AuthRequest,
} from '../middleware/auth.ts';
import { ensureSeeded } from '../seed.ts';
import { recordAuditLog } from './audit.ts';

export const projectsRouter = Router();

async function hydrateProjects(sectorFilterId?: number | null) {
  await ensureSeeded();

  const [projectRows, sectorRows, memberRows, txRows, logRows, userRows] =
    await Promise.all([
      db.select().from(projects).orderBy(desc(projects.id)),
      db.select().from(sectors),
      db.select().from(members),
      db.select().from(financialTransactions),
      db
        .select()
        .from(projectProgressLogs)
        .orderBy(desc(projectProgressLogs.logDate), desc(projectProgressLogs.id)),
      db.select().from(users),
    ]);

  const sectorById = new Map(sectorRows.map((s) => [s.id, s]));
  const memberById = new Map(memberRows.map((m) => [m.id, m]));
  const userById = new Map(userRows.map((u) => [u.id, u]));

  const reversedIds = new Set<number>();
  for (const tx of txRows) {
    if (
      tx.txType === 'reversal' &&
      tx.approvalStatus === 'approved' &&
      tx.reversedTransactionId != null
    ) {
      reversedIds.add(tx.reversedTransactionId);
    }
  }

  const finByProject = new Map<
    number,
    { investmentReceived: number; expenditure: number; revenue: number }
  >();

  for (const tx of txRows) {
    if (
      !tx.projectId ||
      tx.approvalStatus !== 'approved' ||
      reversedIds.has(tx.id) ||
      tx.txType === 'reversal'
    ) {
      continue;
    }
    const bucket = finByProject.get(tx.projectId) ?? {
      investmentReceived: 0,
      expenditure: 0,
      revenue: 0,
    };
    const amt = Number(tx.amount) || 0;
    if (tx.txType === 'project_investment') {
      bucket.investmentReceived += amt;
      bucket.expenditure += amt;
    } else if (tx.txType === 'operational_expense') {
      bucket.expenditure += amt;
    } else if (tx.txType === 'revenue') {
      bucket.revenue += amt;
    }
    finByProject.set(tx.projectId, bucket);
  }

  const logsByProject = new Map<
    number,
    Array<{
      id: number;
      milestonePct: number;
      summary: string;
      logDate: string;
      loggedByEmail: string;
    }>
  >();

  for (const l of logRows) {
    const arr = logsByProject.get(l.projectId) ?? [];
    arr.push({
      id: l.id,
      milestonePct: l.milestonePct,
      summary: l.summary,
      logDate: l.logDate,
      loggedByEmail: l.loggedByUserId
        ? userById.get(l.loggedByUserId)?.email ?? 'system'
        : 'system',
    });
    logsByProject.set(l.projectId, arr);
  }

  return projectRows
    .filter((p) => (!sectorFilterId ? true : p.sectorId === sectorFilterId))
    .map((p) => {
      const sector = sectorById.get(p.sectorId);
      const manager = p.managerMemberId
        ? memberById.get(p.managerMemberId)
        : null;
      const fin = finByProject.get(p.id) ?? {
        investmentReceived: 0,
        expenditure: 0,
        revenue: 0,
      };
      const logs = logsByProject.get(p.id) ?? [];
      return {
        id: p.id,
        sectorId: p.sectorId,
        sectorName: sector?.name ?? 'Unknown',
        sectorSlug: sector?.slug ?? 'unknown',
        managerMemberId: p.managerMemberId,
        managerName: manager?.fullName ?? null,
        code: p.code,
        name: p.name,
        description: p.description,
        budget: Number(p.budget),
        investmentReceived: Math.round(fin.investmentReceived * 100) / 100,
        expenditure: Math.round(fin.expenditure * 100) / 100,
        revenue: Math.round(fin.revenue * 100) / 100,
        status: p.status,
        startDate: p.startDate,
        targetEndDate: p.targetEndDate,
        latestProgressPct: logs[0]?.milestonePct ?? 0,
        progressLogs: logs,
      };
    });
}

projectsRouter.get(
  '/',
  requireAuth,
  requirePermission('projects.view'),
  async (req: AuthRequest, res) => {
    try {
      const sectorId =
        typeof req.query.sectorId === 'string' && req.query.sectorId
          ? Number(req.query.sectorId)
          : null;
      const list = await hydrateProjects(sectorId);
      res.json({ projects: list });
    } catch (error) {
      console.error('Failed to load projects:', error);
      res.status(500).json({ error: 'Unable to load projects.' });
    }
  }
);

projectsRouter.post(
  '/',
  requireAuth,
  async (req: AuthRequest, res) => {
    const body = req.body ?? {};
    const sectorId = Number(body.sectorId);
    const managerMemberId = body.managerMemberId
      ? Number(body.managerMemberId)
      : null;
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const description =
      typeof body.description === 'string' ? body.description.trim() : '';
    const budget = Number(body.budget);
    const status = typeof body.status === 'string' ? body.status : 'active';
    const startDate =
      typeof body.startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.startDate)
        ? body.startDate
        : new Date().toISOString().slice(0, 10);
    const targetEndDate =
      typeof body.targetEndDate === 'string' ? body.targetEndDate : '';

    if (!Number.isInteger(sectorId)) {
      res.status(400).json({ error: 'Valid sectorId is required.' });
      return;
    }

    if (!hasPermission(req.access, 'projects.manage', sectorId)) {
      res.status(403).json({
        error: 'You do not have permission to create projects in this sector.',
      });
      return;
    }

    if (name.length < 3 || description.length < 5) {
      res.status(400).json({
        error: 'Project name and description are required.',
      });
      return;
    }
    if (!Number.isFinite(budget) || budget < 0) {
      res.status(400).json({ error: 'Budget must be a non-negative number.' });
      return;
    }

    try {
      const [sectorRow] = await db
        .select()
        .from(sectors)
        .where(eq(sectors.id, sectorId))
        .limit(1);
      if (!sectorRow) {
        res.status(404).json({ error: 'Target sector not found.' });
        return;
      }

      const existingCount = (await db.select({ id: projects.id }).from(projects))
        .length;
      const prefix = sectorRow.slug.slice(0, 2).toUpperCase();
      const code = `PRJ-${prefix}-${String(existingCount + 1).padStart(2, '0')}`;

      const [created] = await db
        .insert(projects)
        .values({
          sectorId,
          managerMemberId,
          code,
          name,
          description,
          budget: budget.toFixed(2),
          status,
          startDate,
          targetEndDate,
        })
        .returning();

      await recordAuditLog({
        actorUserId: req.access!.userId,
        actorEmail: req.access!.email,
        actorRole: req.access!.globalRoleSlug,
        action: 'PROJECT_CREATED',
        entityType: 'project',
        entityId: created.id,
        sectorId,
        summary: `Created project ${created.name} (${created.code}) with budget $${created.budget}.`,
      });

      const list = await hydrateProjects();
      const hydrated = list.find((p) => p.id === created.id);
      res.status(201).json({ project: hydrated });
    } catch (error) {
      console.error('Failed to create project:', error);
      res.status(500).json({ error: 'Unable to create project.' });
    }
  }
);

projectsRouter.patch(
  '/:id',
  requireAuth,
  async (req: AuthRequest, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: 'Invalid project ID.' });
      return;
    }

    try {
      const [existing] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, id))
        .limit(1);
      if (!existing) {
        res.status(404).json({ error: 'Project not found.' });
        return;
      }

      if (!hasPermission(req.access, 'projects.manage', existing.sectorId)) {
        res.status(403).json({ error: 'Insufficient permissions for this sector project.' });
        return;
      }

      const body = req.body ?? {};
      const [updated] = await db
        .update(projects)
        .set({
          name:
            typeof body.name === 'string' && body.name.trim()
              ? body.name.trim()
              : existing.name,
          description:
            typeof body.description === 'string' && body.description.trim()
              ? body.description.trim()
              : existing.description,
          status: typeof body.status === 'string' ? body.status : existing.status,
          budget:
            body.budget !== undefined &&
            Number.isFinite(Number(body.budget)) &&
            Number(body.budget) >= 0
              ? Number(body.budget).toFixed(2)
              : existing.budget,
          managerMemberId:
            body.managerMemberId !== undefined
              ? body.managerMemberId
                ? Number(body.managerMemberId)
                : null
              : existing.managerMemberId,
        })
        .where(eq(projects.id, id))
        .returning();

      await recordAuditLog({
        actorUserId: req.access!.userId,
        actorEmail: req.access!.email,
        actorRole: req.access!.globalRoleSlug,
        action: 'PROJECT_UPDATED',
        entityType: 'project',
        entityId: updated.id,
        sectorId: updated.sectorId,
        summary: `Updated project ${updated.name} (status: ${updated.status}).`,
      });

      const list = await hydrateProjects();
      res.json({ project: list.find((p) => p.id === id) });
    } catch (error) {
      console.error('Failed to update project:', error);
      res.status(500).json({ error: 'Unable to update project.' });
    }
  }
);

projectsRouter.post(
  '/:id/progress',
  requireAuth,
  async (req: AuthRequest, res) => {
    const projectId = Number(req.params.id);
    const milestonePct = Number(req.body?.milestonePct);
    const summary =
      typeof req.body?.summary === 'string' ? req.body.summary.trim() : '';
    const logDate =
      typeof req.body?.logDate === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(req.body.logDate)
        ? req.body.logDate
        : new Date().toISOString().slice(0, 10);

    if (!Number.isInteger(projectId)) {
      res.status(400).json({ error: 'Invalid project ID.' });
      return;
    }
    if (!Number.isFinite(milestonePct) || milestonePct < 0 || milestonePct > 100) {
      res.status(400).json({ error: 'Milestone percentage must be 0 to 100.' });
      return;
    }
    if (summary.length < 3) {
      res.status(400).json({ error: 'Progress summary is required.' });
      return;
    }

    try {
      const [projectRow] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);
      if (!projectRow) {
        res.status(404).json({ error: 'Project not found.' });
        return;
      }

      if (!hasPermission(req.access, 'projects.manage', projectRow.sectorId)) {
        res.status(403).json({ error: 'Insufficient permissions for this sector project.' });
        return;
      }

      await db.insert(projectProgressLogs).values({
        projectId,
        milestonePct: Math.round(milestonePct),
        summary,
        logDate,
        loggedByUserId: req.access!.userId,
      });

      await recordAuditLog({
        actorUserId: req.access!.userId,
        actorEmail: req.access!.email,
        actorRole: req.access!.globalRoleSlug,
        action: 'PROJECT_PROGRESS_LOGGED',
        entityType: 'project',
        entityId: projectId,
        sectorId: projectRow.sectorId,
        summary: `Logged ${Math.round(milestonePct)}% progress on ${projectRow.name}: ${summary}`,
      });

      const list = await hydrateProjects();
      res.status(201).json({ project: list.find((p) => p.id === projectId) });
    } catch (error) {
      console.error('Failed to log project progress:', error);
      res.status(500).json({ error: 'Unable to log project progress.' });
    }
  }
);
