import { Router } from 'express';
import { desc, eq } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import {
  financialTransactions,
  members,
  memberSectorRoles,
  projects,
  sectors,
  users,
} from '../../db/schema.ts';
import {
  computeLedgerSummary,
  hasPermission,
  validateTransactionInput,
} from '../../domain/calculations.ts';
import {
  requireAuth,
  requirePermission,
  type AuthRequest,
} from '../middleware/auth.ts';
import { ensureSeeded } from '../seed.ts';
import { recordAuditLog } from './audit.ts';

export const financeRouter = Router();

financeRouter.get(
  '/summary',
  requireAuth,
  requirePermission('finance.view'),
  async (_req: AuthRequest, res) => {
    try {
      await ensureSeeded();
      const [txRows, sectorRows, roleAssignments] = await Promise.all([
        db.select().from(financialTransactions),
        db.select().from(sectors),
        db.select().from(memberSectorRoles),
      ]);

      const memberCountsBySector: Record<number, number> = {};
      for (const a of roleAssignments) {
        memberCountsBySector[a.sectorId] =
          (memberCountsBySector[a.sectorId] ?? 0) + 1;
      }

      const summary = computeLedgerSummary(
        txRows,
        sectorRows,
        memberCountsBySector
      );
      res.json({ summary });
    } catch (error) {
      console.error('Failed to compute financial summary:', error);
      res.status(500).json({ error: 'Unable to compute financial summary.' });
    }
  }
);

financeRouter.get(
  '/transactions',
  requireAuth,
  requirePermission('finance.view'),
  async (req: AuthRequest, res) => {
    try {
      await ensureSeeded();
      const txTypeFilter =
        typeof req.query.txType === 'string' ? req.query.txType : '';
      const sectorIdFilter =
        typeof req.query.sectorId === 'string' && req.query.sectorId
          ? Number(req.query.sectorId)
          : null;
      const statusFilter =
        typeof req.query.approvalStatus === 'string'
          ? req.query.approvalStatus
          : '';
      const search =
        typeof req.query.search === 'string'
          ? req.query.search.trim().toLowerCase()
          : '';

      const allUsers = await db.select().from(users);
      const userEmailById = new Map(allUsers.map((u) => [u.id, u.email]));

      const rows = await db
        .select({
          id: financialTransactions.id,
          reference: financialTransactions.reference,
          txType: financialTransactions.txType,
          amount: financialTransactions.amount,
          txDate: financialTransactions.txDate,
          description: financialTransactions.description,
          sectorId: financialTransactions.sectorId,
          sectorName: sectors.name,
          projectId: financialTransactions.projectId,
          projectName: projects.name,
          memberId: financialTransactions.memberId,
          memberName: members.fullName,
          counterparty: financialTransactions.counterparty,
          recordedByUserId: financialTransactions.recordedByUserId,
          approvalStatus: financialTransactions.approvalStatus,
          approvedByUserId: financialTransactions.approvedByUserId,
          approvedAt: financialTransactions.approvedAt,
          rejectionReason: financialTransactions.rejectionReason,
          reversedTransactionId: financialTransactions.reversedTransactionId,
          createdAt: financialTransactions.createdAt,
        })
        .from(financialTransactions)
        .leftJoin(sectors, eq(financialTransactions.sectorId, sectors.id))
        .leftJoin(projects, eq(financialTransactions.projectId, projects.id))
        .leftJoin(members, eq(financialTransactions.memberId, members.id))
        .orderBy(
          desc(financialTransactions.txDate),
          desc(financialTransactions.id)
        );

      const formatted = rows
        .map((r) => ({
          ...r,
          amount: Number(r.amount),
          recordedByEmail: r.recordedByUserId
            ? userEmailById.get(r.recordedByUserId) ?? 'system'
            : 'system',
          approvedByEmail: r.approvedByUserId
            ? userEmailById.get(r.approvedByUserId) ?? null
            : null,
          approvedAt: r.approvedAt ? r.approvedAt.toISOString() : null,
          createdAt: r.createdAt.toISOString(),
        }))
        .filter((r) => {
          if (txTypeFilter && r.txType !== txTypeFilter) return false;
          if (sectorIdFilter && r.sectorId !== sectorIdFilter) return false;
          if (statusFilter && r.approvalStatus !== statusFilter) return false;
          if (search) {
            const hay = `${r.reference} ${r.description} ${r.counterparty} ${
              r.sectorName ?? ''
            }`.toLowerCase();
            if (!hay.includes(search)) return false;
          }
          return true;
        });

      res.json({ transactions: formatted });
    } catch (error) {
      console.error('Failed to load ledger transactions:', error);
      res.status(500).json({ error: 'Unable to load financial transactions.' });
    }
  }
);

financeRouter.post(
  '/transactions',
  requireAuth,
  async (req: AuthRequest, res) => {
    const body = req.body ?? {};
    const sectorId = body.sectorId ? Number(body.sectorId) : null;
    const projectId = body.projectId ? Number(body.projectId) : null;
    const memberId = body.memberId ? Number(body.memberId) : null;

    if (!hasPermission(req.access, 'finance.record', sectorId)) {
      res.status(403).json({
        error: 'You do not have permission to record transactions for this scope.',
      });
      return;
    }

    const validation = validateTransactionInput({
      reference: body.reference,
      txType: body.txType,
      amount: body.amount,
      txDate: body.txDate,
      description: body.description,
      sectorId,
      projectId,
    });

    if (!validation.ok) {
      res.status(400).json({ error: validation.error });
      return;
    }

    if (
      body.txType === 'sector_allocation' &&
      !hasPermission(req.access, 'finance.approve')
    ) {
      res.status(403).json({
        error: 'Only Administrators or Founders can allocate funds to sectors.',
      });
      return;
    }

    const reference = String(body.reference).trim();
    const canApprove = hasPermission(req.access, 'finance.approve', sectorId);
    const requiresApproval =
      body.txType === 'operational_expense' ||
      body.txType === 'project_investment';
    const approveImmediately = Boolean(body.approveImmediately) && canApprove;
    const approvalStatus =
      !requiresApproval || approveImmediately ? 'approved' : 'pending';

    try {
      const [existingRef] = await db
        .select()
        .from(financialTransactions)
        .where(eq(financialTransactions.reference, reference))
        .limit(1);
      if (existingRef) {
        res.status(409).json({
          error: `Duplicate transaction reference "${reference}". Financial ledger references must be unique.`,
        });
        return;
      }

      const [created] = await db
        .insert(financialTransactions)
        .values({
          reference,
          txType: body.txType,
          amount: Number(body.amount).toFixed(2),
          txDate: body.txDate,
          description: String(body.description).trim(),
          sectorId,
          projectId,
          memberId,
          counterparty:
            typeof body.counterparty === 'string' ? body.counterparty.trim() : '',
          recordedByUserId: req.access!.userId,
          approvalStatus,
          approvedByUserId: approvalStatus === 'approved' ? req.access!.userId : null,
          approvedAt: approvalStatus === 'approved' ? new Date() : null,
        })
        .returning();

      await recordAuditLog({
        actorUserId: req.access!.userId,
        actorEmail: req.access!.email,
        actorRole: req.access!.globalRoleSlug,
        action: 'FINANCE_TX_CREATED',
        entityType: 'financial_transaction',
        entityId: created.id,
        sectorId,
        summary: `Recorded ${created.txType} (${created.reference}) for $${created.amount} [${created.approvalStatus}].`,
        metadata: {
          reference: created.reference,
          txType: created.txType,
          amount: created.amount,
          approvalStatus: created.approvalStatus,
        },
      });

      res.status(201).json({ transaction: created });
    } catch (error) {
      console.error('Failed to record transaction:', error);
      res.status(500).json({ error: 'Unable to record financial transaction.' });
    }
  }
);

financeRouter.post(
  '/transactions/:id/approve',
  requireAuth,
  requirePermission('finance.approve'),
  async (req: AuthRequest, res) => {
    const id = Number(req.params.id);
    const decision = req.body?.decision === 'rejected' ? 'rejected' : 'approved';
    const rejectionReason =
      typeof req.body?.rejectionReason === 'string'
        ? req.body.rejectionReason.trim()
        : '';

    if (!Number.isInteger(id)) {
      res.status(400).json({ error: 'Invalid transaction ID.' });
      return;
    }
    if (decision === 'rejected' && rejectionReason.length < 3) {
      res
        .status(400)
        .json({ error: 'Provide a reason when rejecting a transaction.' });
      return;
    }

    try {
      const [txRow] = await db
        .select()
        .from(financialTransactions)
        .where(eq(financialTransactions.id, id))
        .limit(1);
      if (!txRow) {
        res.status(404).json({ error: 'Transaction not found.' });
        return;
      }
      if (txRow.approvalStatus !== 'pending') {
        res.status(400).json({
          error: `Transaction is already ${txRow.approvalStatus} and cannot be re-decided.`,
        });
        return;
      }

      const [updated] = await db
        .update(financialTransactions)
        .set({
          approvalStatus: decision,
          approvedByUserId: req.access!.userId,
          approvedAt: new Date(),
          rejectionReason: decision === 'rejected' ? rejectionReason : '',
        })
        .where(eq(financialTransactions.id, id))
        .returning();

      await recordAuditLog({
        actorUserId: req.access!.userId,
        actorEmail: req.access!.email,
        actorRole: req.access!.globalRoleSlug,
        action:
          decision === 'approved'
            ? 'FINANCE_TX_APPROVED'
            : 'FINANCE_TX_REJECTED',
        entityType: 'financial_transaction',
        entityId: updated.id,
        sectorId: updated.sectorId,
        summary: `${decision === 'approved' ? 'Approved' : 'Rejected'} transaction ${updated.reference} ($${updated.amount}).`,
        metadata: { decision, rejectionReason },
      });

      res.json({ transaction: updated });
    } catch (error) {
      console.error('Failed to process transaction approval:', error);
      res.status(500).json({ error: 'Unable to update approval status.' });
    }
  }
);

financeRouter.post(
  '/transactions/:id/reverse',
  requireAuth,
  requirePermission('finance.approve'),
  async (req: AuthRequest, res) => {
    const id = Number(req.params.id);
    const reason =
      typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    if (!Number.isInteger(id) || reason.length < 3) {
      res.status(400).json({
        error: 'Valid transaction ID and reversal reason are required.',
      });
      return;
    }

    try {
      const [original] = await db
        .select()
        .from(financialTransactions)
        .where(eq(financialTransactions.id, id))
        .limit(1);
      if (!original) {
        res.status(404).json({ error: 'Original transaction not found.' });
        return;
      }
      if (original.txType === 'reversal' || original.approvalStatus !== 'approved') {
        res.status(400).json({
          error: 'Only approved non-reversal transactions can be reversed.',
        });
        return;
      }

      const [alreadyReversed] = await db
        .select()
        .from(financialTransactions)
        .where(eq(financialTransactions.reversedTransactionId, original.id))
        .limit(1);
      if (alreadyReversed) {
        res.status(409).json({
          error: `Transaction ${original.reference} has already been reversed by ${alreadyReversed.reference}.`,
        });
        return;
      }

      const reversalRef = `REV-${original.reference}`;
      const [reversal] = await db
        .insert(financialTransactions)
        .values({
          reference: reversalRef,
          txType: 'reversal',
          amount: original.amount,
          txDate: new Date().toISOString().slice(0, 10),
          description: `Reversal of ${original.reference}: ${reason}`,
          sectorId: original.sectorId,
          projectId: original.projectId,
          memberId: original.memberId,
          counterparty: original.counterparty,
          recordedByUserId: req.access!.userId,
          approvalStatus: 'approved',
          approvedByUserId: req.access!.userId,
          approvedAt: new Date(),
          reversedTransactionId: original.id,
        })
        .returning();

      await recordAuditLog({
        actorUserId: req.access!.userId,
        actorEmail: req.access!.email,
        actorRole: req.access!.globalRoleSlug,
        action: 'FINANCE_TX_REVERSED',
        entityType: 'financial_transaction',
        entityId: original.id,
        sectorId: original.sectorId,
        summary: `Posted immutable reversal ${reversal.reference} against ${original.reference} ($${original.amount}).`,
        metadata: { reason, reversalId: reversal.id },
      });

      res.status(201).json({ reversal });
    } catch (error) {
      console.error('Failed to reverse transaction:', error);
      res.status(500).json({ error: 'Unable to post reversal entry.' });
    }
  }
);
