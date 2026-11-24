import { Router } from 'express';
import { desc, eq } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import {
  agricultureRecords,
  piggeryRecords,
  poultryRecords,
  sectors,
  verticalFarmingRecords,
} from '../../db/schema.ts';
import { hasPermission } from '../../domain/calculations.ts';
import {
  requireAuth,
  requirePermission,
  type AuthRequest,
} from '../middleware/auth.ts';
import { ensureSeeded } from '../seed.ts';
import { recordAuditLog } from './audit.ts';

export const operationsRouter = Router();

async function getSectorIdBySlug(slug: string): Promise<number | null> {
  const [row] = await db
    .select()
    .from(sectors)
    .where(eq(sectors.slug, slug))
    .limit(1);
  return row?.id ?? null;
}

// AGRICULTURE
operationsRouter.get(
  '/agriculture',
  requireAuth,
  requirePermission('operations.view'),
  async (_req: AuthRequest, res) => {
    try {
      await ensureSeeded();
      const rows = await db
        .select()
        .from(agricultureRecords)
        .orderBy(desc(agricultureRecords.plantingDate), desc(agricultureRecords.id));
      res.json({
        records: rows.map((r) => ({
          ...r,
          inputCost: Number(r.inputCost),
          expectedYieldKg: Number(r.expectedYieldKg),
          actualYieldKg: Number(r.actualYieldKg),
        })),
      });
    } catch (error) {
      console.error('Failed to fetch agriculture operations:', error);
      res.status(500).json({ error: 'Unable to load agriculture records.' });
    }
  }
);

operationsRouter.post(
  '/agriculture',
  requireAuth,
  async (req: AuthRequest, res) => {
    await ensureSeeded();
    const sectorId = await getSectorIdBySlug('agriculture');
    if (!sectorId || !hasPermission(req.access, 'operations.write', sectorId)) {
      res.status(403).json({ error: 'Permission denied for Agriculture operations.' });
      return;
    }

    const body = req.body ?? {};
    const cropName = typeof body.cropName === 'string' ? body.cropName.trim() : '';
    const plotName = typeof body.plotName === 'string' ? body.plotName.trim() : '';
    const plantingDate =
      typeof body.plantingDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.plantingDate)
        ? body.plantingDate
        : new Date().toISOString().slice(0, 10);

    if (cropName.length < 2 || plotName.length < 2) {
      res.status(400).json({ error: 'Crop name and plot name are required.' });
      return;
    }

    try {
      const [created] = await db
        .insert(agricultureRecords)
        .values({
          sectorId,
          projectId: body.projectId ? Number(body.projectId) : null,
          cropName,
          plotName,
          plantingDate,
          harvestDate: typeof body.harvestDate === 'string' ? body.harvestDate : '',
          stage: typeof body.stage === 'string' ? body.stage : 'planted',
          inputsUsed: typeof body.inputsUsed === 'string' ? body.inputsUsed.trim() : '',
          inputCost: (Math.max(0, Number(body.inputCost) || 0)).toFixed(2),
          expectedYieldKg: (Math.max(0, Number(body.expectedYieldKg) || 0)).toFixed(2),
          actualYieldKg: (Math.max(0, Number(body.actualYieldKg) || 0)).toFixed(2),
          notes: typeof body.notes === 'string' ? body.notes.trim() : '',
          recordedByUserId: req.access!.userId,
        })
        .returning();

      await recordAuditLog({
        actorUserId: req.access!.userId,
        actorEmail: req.access!.email,
        actorRole: req.access!.globalRoleSlug,
        action: 'AG_RECORD_CREATED',
        entityType: 'agriculture_record',
        entityId: created.id,
        sectorId,
        summary: `Logged crop cycle "${created.cropName}" on ${created.plotName}.`,
      });

      res.status(201).json({
        record: {
          ...created,
          inputCost: Number(created.inputCost),
          expectedYieldKg: Number(created.expectedYieldKg),
          actualYieldKg: Number(created.actualYieldKg),
        },
      });
    } catch (error) {
      console.error('Failed to log agriculture record:', error);
      res.status(500).json({ error: 'Unable to save crop cycle.' });
    }
  }
);

// PIGGERY
operationsRouter.get(
  '/piggery',
  requireAuth,
  requirePermission('operations.view'),
  async (_req: AuthRequest, res) => {
    try {
      await ensureSeeded();
      const rows = await db
        .select()
        .from(piggeryRecords)
        .orderBy(desc(piggeryRecords.recordDate), desc(piggeryRecords.id));
      res.json({
        records: rows.map((r) => ({
          ...r,
          feedCost: Number(r.feedCost),
          operatingCost: Number(r.operatingCost),
          salesRevenue: Number(r.salesRevenue),
        })),
      });
    } catch (error) {
      console.error('Failed to fetch piggery operations:', error);
      res.status(500).json({ error: 'Unable to load piggery batches.' });
    }
  }
);

operationsRouter.post(
  '/piggery',
  requireAuth,
  async (req: AuthRequest, res) => {
    await ensureSeeded();
    const sectorId = await getSectorIdBySlug('piggery');
    if (!sectorId || !hasPermission(req.access, 'operations.write', sectorId)) {
      res.status(403).json({ error: 'Permission denied for Piggery operations.' });
      return;
    }

    const body = req.body ?? {};
    const batchCode = typeof body.batchCode === 'string' ? body.batchCode.trim() : '';
    const category = typeof body.category === 'string' ? body.category : 'growers';
    const recordDate =
      typeof body.recordDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.recordDate)
        ? body.recordDate
        : new Date().toISOString().slice(0, 10);

    if (batchCode.length < 2) {
      res.status(400).json({ error: 'Batch code is required.' });
      return;
    }

    try {
      const [created] = await db
        .insert(piggeryRecords)
        .values({
          sectorId,
          projectId: body.projectId ? Number(body.projectId) : null,
          batchCode,
          category,
          headCount: Math.max(0, Math.round(Number(body.headCount) || 0)),
          birthsCount: Math.max(0, Math.round(Number(body.birthsCount) || 0)),
          purchasesCount: Math.max(0, Math.round(Number(body.purchasesCount) || 0)),
          salesCount: Math.max(0, Math.round(Number(body.salesCount) || 0)),
          feedPlan: typeof body.feedPlan === 'string' ? body.feedPlan.trim() : '',
          feedCost: (Math.max(0, Number(body.feedCost) || 0)).toFixed(2),
          operatingCost: (Math.max(0, Number(body.operatingCost) || 0)).toFixed(2),
          salesRevenue: (Math.max(0, Number(body.salesRevenue) || 0)).toFixed(2),
          healthStatus: typeof body.healthStatus === 'string' ? body.healthStatus : 'healthy',
          recordDate,
          notes: typeof body.notes === 'string' ? body.notes.trim() : '',
          recordedByUserId: req.access!.userId,
        })
        .returning();

      await recordAuditLog({
        actorUserId: req.access!.userId,
        actorEmail: req.access!.email,
        actorRole: req.access!.globalRoleSlug,
        action: 'PIGGERY_RECORD_CREATED',
        entityType: 'piggery_batch',
        entityId: created.id,
        sectorId,
        summary: `Logged piggery batch ${created.batchCode} (${created.headCount} head, ${created.category}).`,
      });

      res.status(201).json({
        record: {
          ...created,
          feedCost: Number(created.feedCost),
          operatingCost: Number(created.operatingCost),
          salesRevenue: Number(created.salesRevenue),
        },
      });
    } catch (error) {
      console.error('Failed to save piggery batch:', error);
      res.status(500).json({ error: 'Unable to save piggery record.' });
    }
  }
);

// POULTRY
operationsRouter.get(
  '/poultry',
  requireAuth,
  requirePermission('operations.view'),
  async (_req: AuthRequest, res) => {
    try {
      await ensureSeeded();
      const rows = await db
        .select()
        .from(poultryRecords)
        .orderBy(desc(poultryRecords.recordDate), desc(poultryRecords.id));
      res.json({
        records: rows.map((r) => ({
          ...r,
          feedUsedKg: Number(r.feedUsedKg),
          feedCost: Number(r.feedCost),
          operatingCost: Number(r.operatingCost),
          salesRevenue: Number(r.salesRevenue),
        })),
      });
    } catch (error) {
      console.error('Failed to fetch poultry operations:', error);
      res.status(500).json({ error: 'Unable to load poultry flocks.' });
    }
  }
);

operationsRouter.post(
  '/poultry',
  requireAuth,
  async (req: AuthRequest, res) => {
    await ensureSeeded();
    const sectorId = await getSectorIdBySlug('poultry');
    if (!sectorId || !hasPermission(req.access, 'operations.write', sectorId)) {
      res.status(403).json({ error: 'Permission denied for Poultry operations.' });
      return;
    }

    const body = req.body ?? {};
    const flockCode = typeof body.flockCode === 'string' ? body.flockCode.trim() : '';
    const birdType = typeof body.birdType === 'string' ? body.birdType : 'layers';
    const recordDate =
      typeof body.recordDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.recordDate)
        ? body.recordDate
        : new Date().toISOString().slice(0, 10);

    if (flockCode.length < 2) {
      res.status(400).json({ error: 'Flock code is required.' });
      return;
    }

    try {
      const [created] = await db
        .insert(poultryRecords)
        .values({
          sectorId,
          projectId: body.projectId ? Number(body.projectId) : null,
          flockCode,
          birdType,
          birdCount: Math.max(0, Math.round(Number(body.birdCount) || 0)),
          mortalityCount: Math.max(0, Math.round(Number(body.mortalityCount) || 0)),
          eggsCollected: Math.max(0, Math.round(Number(body.eggsCollected) || 0)),
          feedUsedKg: (Math.max(0, Number(body.feedUsedKg) || 0)).toFixed(2),
          feedCost: (Math.max(0, Number(body.feedCost) || 0)).toFixed(2),
          operatingCost: (Math.max(0, Number(body.operatingCost) || 0)).toFixed(2),
          salesRevenue: (Math.max(0, Number(body.salesRevenue) || 0)).toFixed(2),
          recordDate,
          notes: typeof body.notes === 'string' ? body.notes.trim() : '',
          recordedByUserId: req.access!.userId,
        })
        .returning();

      await recordAuditLog({
        actorUserId: req.access!.userId,
        actorEmail: req.access!.email,
        actorRole: req.access!.globalRoleSlug,
        action: 'POULTRY_RECORD_CREATED',
        entityType: 'poultry_flock',
        entityId: created.id,
        sectorId,
        summary: `Logged poultry flock ${created.flockCode} (${created.birdCount} ${created.birdType}, ${created.eggsCollected} eggs).`,
      });

      res.status(201).json({
        record: {
          ...created,
          feedUsedKg: Number(created.feedUsedKg),
          feedCost: Number(created.feedCost),
          operatingCost: Number(created.operatingCost),
          salesRevenue: Number(created.salesRevenue),
        },
      });
    } catch (error) {
      console.error('Failed to save poultry flock:', error);
      res.status(500).json({ error: 'Unable to save poultry record.' });
    }
  }
);

// VERTICAL FARMING
operationsRouter.get(
  '/vertical-farming',
  requireAuth,
  requirePermission('operations.view'),
  async (_req: AuthRequest, res) => {
    try {
      await ensureSeeded();
      const rows = await db
        .select()
        .from(verticalFarmingRecords)
        .orderBy(
          desc(verticalFarmingRecords.recordDate),
          desc(verticalFarmingRecords.id)
        );
      res.json({
        records: rows.map((r) => ({
          ...r,
          nutrientPh: Number(r.nutrientPh),
          ecLevel: Number(r.ecLevel),
          operatingCost: Number(r.operatingCost),
          yieldKg: Number(r.yieldKg),
        })),
      });
    } catch (error) {
      console.error('Failed to fetch vertical farming operations:', error);
      res.status(500).json({ error: 'Unable to load vertical farming records.' });
    }
  }
);

operationsRouter.post(
  '/vertical-farming',
  requireAuth,
  async (req: AuthRequest, res) => {
    await ensureSeeded();
    const sectorId = await getSectorIdBySlug('vertical_farming');
    if (!sectorId || !hasPermission(req.access, 'operations.write', sectorId)) {
      res.status(403).json({
        error: 'Permission denied for Vertical Farming operations.',
      });
      return;
    }

    const body = req.body ?? {};
    const systemName =
      typeof body.systemName === 'string' ? body.systemName.trim() : '';
    const cropVariety =
      typeof body.cropVariety === 'string' ? body.cropVariety.trim() : '';
    const recordDate =
      typeof body.recordDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.recordDate)
        ? body.recordDate
        : new Date().toISOString().slice(0, 10);

    if (systemName.length < 2 || cropVariety.length < 2) {
      res
        .status(400)
        .json({ error: 'Growing system name and crop variety are required.' });
      return;
    }

    try {
      const [created] = await db
        .insert(verticalFarmingRecords)
        .values({
          sectorId,
          projectId: body.projectId ? Number(body.projectId) : null,
          systemName,
          systemType:
            typeof body.systemType === 'string' ? body.systemType : 'NFT Hydroponics',
          cropVariety,
          cycleNumber: Math.max(1, Math.round(Number(body.cycleNumber) || 1)),
          cycleStage:
            typeof body.cycleStage === 'string' ? body.cycleStage : 'vegetative',
          nutrientPh: (Number(body.nutrientPh) || 6.0).toFixed(2),
          ecLevel: (Number(body.ecLevel) || 1.8).toFixed(2),
          inputsNote:
            typeof body.inputsNote === 'string' ? body.inputsNote.trim() : '',
          operatingCost: (Math.max(0, Number(body.operatingCost) || 0)).toFixed(2),
          yieldKg: (Math.max(0, Number(body.yieldKg) || 0)).toFixed(2),
          recordDate,
          recordedByUserId: req.access!.userId,
        })
        .returning();

      await recordAuditLog({
        actorUserId: req.access!.userId,
        actorEmail: req.access!.email,
        actorRole: req.access!.globalRoleSlug,
        action: 'VF_RECORD_CREATED',
        entityType: 'vf_system',
        entityId: created.id,
        sectorId,
        summary: `Logged vertical farming cycle #${created.cycleNumber} (${created.systemName} — ${created.cropVariety}).`,
      });

      res.status(201).json({
        record: {
          ...created,
          nutrientPh: Number(created.nutrientPh),
          ecLevel: Number(created.ecLevel),
          operatingCost: Number(created.operatingCost),
          yieldKg: Number(created.yieldKg),
        },
      });
    } catch (error) {
      console.error('Failed to save vertical farming record:', error);
      res.status(500).json({ error: 'Unable to save vertical farming record.' });
    }
  }
);
