import { Router } from 'express';
import { asc, desc, eq } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import {
  financialTransactions,
  memberPayments,
  members,
  memberSectorRoles,
  roles,
  sectors,
  users,
} from '../../db/schema.ts';
import { computeMemberPaymentSummary } from '../../domain/calculations.ts';
import type { MemberDto } from '../../domain/types.ts';
import {
  requireAuth,
  requirePermission,
  type AuthRequest,
} from '../middleware/auth.ts';
import { ensureSeeded } from '../seed.ts';
import { recordAuditLog } from './audit.ts';

export const membersRouter = Router();

async function hydrateMembers(targetMemberId?: number): Promise<MemberDto[]> {
  await ensureSeeded();

  const memberRows = targetMemberId
    ? await db.select().from(members).where(eq(members.id, targetMemberId))
    : await db.select().from(members).orderBy(asc(members.fullName));

  const assignmentRows = await db
    .select({
      memberId: memberSectorRoles.memberId,
      sectorId: memberSectorRoles.sectorId,
      sectorSlug: sectors.slug,
      sectorName: sectors.name,
      roleId: memberSectorRoles.roleId,
      roleSlug: roles.slug,
      roleName: roles.name,
      isPrimary: memberSectorRoles.isPrimary,
    })
    .from(memberSectorRoles)
    .innerJoin(sectors, eq(memberSectorRoles.sectorId, sectors.id))
    .innerJoin(roles, eq(memberSectorRoles.roleId, roles.id));

  const paymentRows = await db
    .select({
      id: memberPayments.id,
      memberId: memberPayments.memberId,
      transactionId: memberPayments.transactionId,
      amount: memberPayments.amount,
      paymentDate: memberPayments.paymentDate,
      paymentMethod: memberPayments.paymentMethod,
      reference: memberPayments.reference,
      notes: memberPayments.notes,
      recordedByEmail: users.email,
    })
    .from(memberPayments)
    .leftJoin(users, eq(memberPayments.recordedByUserId, users.id))
    .orderBy(desc(memberPayments.paymentDate), desc(memberPayments.id));

  const assignmentsByMember = new Map<number, MemberDto['sectorRoles']>();
  for (const row of assignmentRows) {
    const arr = assignmentsByMember.get(row.memberId) ?? [];
    arr.push({
      sectorId: row.sectorId,
      sectorSlug: row.sectorSlug,
      sectorName: row.sectorName,
      roleId: row.roleId,
      roleSlug: row.roleSlug,
      roleName: row.roleName,
      isPrimary: row.isPrimary,
    });
    assignmentsByMember.set(row.memberId, arr);
  }

  const paymentsByMember = new Map<number, NonNullable<MemberDto['payments']>>();
  for (const p of paymentRows) {
    const arr = paymentsByMember.get(p.memberId) ?? [];
    arr.push({
      id: p.id,
      memberId: p.memberId,
      transactionId: p.transactionId,
      amount: Number(p.amount),
      paymentDate: p.paymentDate,
      paymentMethod: p.paymentMethod,
      reference: p.reference,
      notes: p.notes,
      recordedByEmail: p.recordedByEmail ?? 'system',
    });
    paymentsByMember.set(p.memberId, arr);
  }

  return memberRows.map((m) => {
    const payments = paymentsByMember.get(m.id) ?? [];
    const summary = computeMemberPaymentSummary(m.contributionRequired, payments);
    return {
      id: m.id,
      userId: m.userId,
      memberCode: m.memberCode,
      fullName: m.fullName,
      email: m.email,
      phone: m.phone,
      location: m.location,
      dateJoined: m.dateJoined,
      status: m.status,
      contributionRequired: summary.contributionRequired,
      amountPaid: summary.amountPaid,
      outstandingBalance: summary.outstandingBalance,
      paymentStatus: summary.paymentStatus,
      notes: m.notes,
      sectorRoles: assignmentsByMember.get(m.id) ?? [],
      payments,
    };
  });
}

membersRouter.get(
  '/',
  requireAuth,
  requirePermission('members.view'),
  async (req: AuthRequest, res) => {
    try {
      const search =
        typeof req.query.search === 'string'
          ? req.query.search.trim().toLowerCase()
          : '';
      const sectorId =
        typeof req.query.sectorId === 'string' && req.query.sectorId
          ? Number(req.query.sectorId)
          : null;
      const paymentStatus =
        typeof req.query.paymentStatus === 'string' ? req.query.paymentStatus : '';

      const all = await hydrateMembers();
      const filtered = all.filter((m) => {
        if (search) {
          const hay = `${m.fullName} ${m.email} ${m.memberCode} ${m.phone}`.toLowerCase();
          if (!hay.includes(search)) return false;
        }
        if (sectorId && !m.sectorRoles.some((sr) => sr.sectorId === sectorId)) {
          return false;
        }
        if (paymentStatus && m.paymentStatus !== paymentStatus) {
          return false;
        }
        return true;
      });

      res.json({ members: filtered });
    } catch (error) {
      console.error('Failed to load members:', error);
      res.status(500).json({ error: 'Unable to load members.' });
    }
  }
);

membersRouter.get(
  '/:id',
  requireAuth,
  requirePermission('members.view'),
  async (req: AuthRequest, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: 'Invalid member ID.' });
      return;
    }

    try {
      const [member] = await hydrateMembers(id);
      if (!member) {
        res.status(404).json({ error: 'Member not found.' });
        return;
      }
      res.json({ member });
    } catch (error) {
      console.error('Failed to load member details:', error);
      res.status(500).json({ error: 'Unable to load member details.' });
    }
  }
);

interface AssignmentInput {
  sectorId: number;
  roleId: number;
  isPrimary?: boolean;
}

membersRouter.post(
  '/',
  requireAuth,
  requirePermission('members.write'),
  async (req: AuthRequest, res) => {
    const body = req.body ?? {};
    const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
    const location = typeof body.location === 'string' ? body.location.trim() : 'Central Hub';
    const dateJoined =
      typeof body.dateJoined === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.dateJoined)
        ? body.dateJoined
        : new Date().toISOString().slice(0, 10);
    const status = typeof body.status === 'string' ? body.status : 'active';
    const contributionRequired = Number(body.contributionRequired);
    const notes = typeof body.notes === 'string' ? body.notes.trim() : '';
    const assignments: AssignmentInput[] = Array.isArray(body.sectorRoles)
      ? body.sectorRoles
      : [];

    if (fullName.length < 2 || !email.includes('@') || phone.length < 5) {
      res.status(400).json({
        error: 'Full name, valid email address, and phone number are required.',
      });
      return;
    }
    if (!Number.isFinite(contributionRequired) || contributionRequired < 0) {
      res.status(400).json({ error: 'Contribution requirement must be non-negative.' });
      return;
    }
    if (assignments.length === 0) {
      res.status(400).json({ error: 'Assign at least one sector and role to the member.' });
      return;
    }

    // Deduplicate sector assignments to prevent invalid duplicate sector entries
    const uniqueBySector = new Map<number, AssignmentInput>();
    for (const a of assignments) {
      if (Number.isInteger(Number(a.sectorId)) && Number.isInteger(Number(a.roleId))) {
        uniqueBySector.set(Number(a.sectorId), {
          sectorId: Number(a.sectorId),
          roleId: Number(a.roleId),
          isPrimary: Boolean(a.isPrimary),
        });
      }
    }

    try {
      const [existingByEmail] = await db
        .select()
        .from(members)
        .where(eq(members.email, email))
        .limit(1);
      if (existingByEmail) {
        res.status(409).json({
          error:
            'A member profile with this email already exists. Edit the existing profile to assign additional sectors.',
        });
        return;
      }

      const [linkedUser] = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      const created = await db.transaction(async (tx) => {
        const existingAll = await tx.select({ id: members.id }).from(members);
        const memberCode = `GZA-${String(existingAll.length + 1).padStart(3, '0')}`;

        const [inserted] = await tx
          .insert(members)
          .values({
            userId: linkedUser?.id ?? null,
            memberCode,
            fullName,
            email,
            phone,
            location: location || 'Central Hub',
            dateJoined,
            status,
            contributionRequired: contributionRequired.toFixed(2),
            notes,
          })
          .returning();

        const rows = Array.from(uniqueBySector.values()).map((a, idx) => ({
          memberId: inserted.id,
          sectorId: a.sectorId,
          roleId: a.roleId,
          isPrimary: a.isPrimary || idx === 0,
        }));
        await tx.insert(memberSectorRoles).values(rows);
        return inserted;
      });

      await recordAuditLog({
        actorUserId: req.access!.userId,
        actorEmail: req.access!.email,
        actorRole: req.access!.globalRoleSlug,
        action: 'MEMBER_REGISTERED',
        entityType: 'member',
        entityId: created.id,
        summary: `Registered member ${created.fullName} (${created.memberCode}) across ${uniqueBySector.size} sector(s).`,
        metadata: { email: created.email, sectors: Array.from(uniqueBySector.keys()) },
      });

      const [hydrated] = await hydrateMembers(created.id);
      res.status(201).json({ member: hydrated });
    } catch (error) {
      console.error('Failed to register member:', error);
      res.status(500).json({ error: 'Unable to register member.' });
    }
  }
);

membersRouter.patch(
  '/:id',
  requireAuth,
  requirePermission('members.write'),
  async (req: AuthRequest, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: 'Invalid member ID.' });
      return;
    }

    const body = req.body ?? {};
    const assignments: AssignmentInput[] | null = Array.isArray(body.sectorRoles)
      ? body.sectorRoles
      : null;

    try {
      const [existing] = await db
        .select()
        .from(members)
        .where(eq(members.id, id))
        .limit(1);
      if (!existing) {
        res.status(404).json({ error: 'Member not found.' });
        return;
      }

      const nextEmail =
        typeof body.email === 'string' && body.email.includes('@')
          ? body.email.trim().toLowerCase()
          : existing.email;

      if (nextEmail !== existing.email) {
        const [dup] = await db
          .select()
          .from(members)
          .where(eq(members.email, nextEmail))
          .limit(1);
        if (dup) {
          res.status(409).json({ error: 'Another member already uses that email.' });
          return;
        }
      }

      await db.transaction(async (tx) => {
        await tx
          .update(members)
          .set({
            fullName:
              typeof body.fullName === 'string' && body.fullName.trim()
                ? body.fullName.trim()
                : existing.fullName,
            email: nextEmail,
            phone:
              typeof body.phone === 'string' && body.phone.trim()
                ? body.phone.trim()
                : existing.phone,
            location:
              typeof body.location === 'string'
                ? body.location.trim()
                : existing.location,
            status: typeof body.status === 'string' ? body.status : existing.status,
            contributionRequired:
              body.contributionRequired !== undefined &&
              Number.isFinite(Number(body.contributionRequired)) &&
              Number(body.contributionRequired) >= 0
                ? Number(body.contributionRequired).toFixed(2)
                : existing.contributionRequired,
            notes: typeof body.notes === 'string' ? body.notes.trim() : existing.notes,
          })
          .where(eq(members.id, id));

        if (assignments && assignments.length > 0) {
          const uniqueBySector = new Map<number, AssignmentInput>();
          for (const a of assignments) {
            if (Number.isInteger(Number(a.sectorId)) && Number.isInteger(Number(a.roleId))) {
              uniqueBySector.set(Number(a.sectorId), {
                sectorId: Number(a.sectorId),
                roleId: Number(a.roleId),
                isPrimary: Boolean(a.isPrimary),
              });
            }
          }
          await tx
            .delete(memberSectorRoles)
            .where(eq(memberSectorRoles.memberId, id));
          await tx.insert(memberSectorRoles).values(
            Array.from(uniqueBySector.values()).map((a, idx) => ({
              memberId: id,
              sectorId: a.sectorId,
              roleId: a.roleId,
              isPrimary: a.isPrimary || idx === 0,
            }))
          );
        }
      });

      await recordAuditLog({
        actorUserId: req.access!.userId,
        actorEmail: req.access!.email,
        actorRole: req.access!.globalRoleSlug,
        action: 'MEMBER_UPDATED',
        entityType: 'member',
        entityId: id,
        summary: `Updated profile and assignments for ${existing.fullName}.`,
      });

      const [hydrated] = await hydrateMembers(id);
      res.json({ member: hydrated });
    } catch (error) {
      console.error('Failed to update member:', error);
      res.status(500).json({ error: 'Unable to update member.' });
    }
  }
);

membersRouter.post(
  '/:id/payments',
  requireAuth,
  requirePermission('members.payments'),
  async (req: AuthRequest, res) => {
    const memberId = Number(req.params.id);
    if (!Number.isInteger(memberId)) {
      res.status(400).json({ error: 'Invalid member ID.' });
      return;
    }

    const body = req.body ?? {};
    const amount = Number(body.amount);
    const paymentDate =
      typeof body.paymentDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.paymentDate)
        ? body.paymentDate
        : new Date().toISOString().slice(0, 10);
    const paymentMethod =
      typeof body.paymentMethod === 'string' && body.paymentMethod.trim()
        ? body.paymentMethod.trim()
        : 'Mobile Money';
    const reference =
      typeof body.reference === 'string' ? body.reference.trim() : '';
    const notes = typeof body.notes === 'string' ? body.notes.trim() : '';

    if (!Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({ error: 'Payment amount must be greater than zero.' });
      return;
    }
    if (reference.length < 3) {
      res.status(400).json({ error: 'Unique payment reference is required.' });
      return;
    }

    try {
      const [member] = await db
        .select()
        .from(members)
        .where(eq(members.id, memberId))
        .limit(1);
      if (!member) {
        res.status(404).json({ error: 'Member not found.' });
        return;
      }

      const [dupPay] = await db
        .select()
        .from(memberPayments)
        .where(eq(memberPayments.reference, reference))
        .limit(1);
      const txReference = `TX-${reference}`;
      const [dupTx] = await db
        .select()
        .from(financialTransactions)
        .where(eq(financialTransactions.reference, txReference))
        .limit(1);

      if (dupPay || dupTx) {
        res.status(409).json({
          error: 'Duplicate payment reference detected. Use a unique receipt reference.',
        });
        return;
      }

      await db.transaction(async (tx) => {
        const [ftx] = await tx
          .insert(financialTransactions)
          .values({
            reference: txReference,
            txType: 'membership_contribution',
            amount: amount.toFixed(2),
            txDate: paymentDate,
            description: `Membership contribution payment from ${member.fullName} (${member.memberCode})`,
            memberId: member.id,
            counterparty: member.fullName,
            recordedByUserId: req.access!.userId,
            approvalStatus: 'approved',
            approvedByUserId: req.access!.userId,
            approvedAt: new Date(),
          })
          .returning();

        await tx.insert(memberPayments).values({
          memberId: member.id,
          transactionId: ftx.id,
          amount: amount.toFixed(2),
          paymentDate,
          paymentMethod,
          reference,
          notes,
          recordedByUserId: req.access!.userId,
        });
      });

      await recordAuditLog({
        actorUserId: req.access!.userId,
        actorEmail: req.access!.email,
        actorRole: req.access!.globalRoleSlug,
        action: 'MEMBER_PAYMENT_RECORDED',
        entityType: 'member_payment',
        entityId: reference,
        summary: `Recorded $${amount.toFixed(2)} contribution payment for ${member.fullName} (${reference}).`,
        metadata: { memberId, amount, paymentMethod, reference },
      });

      const [hydrated] = await hydrateMembers(memberId);
      res.status(201).json({ member: hydrated });
    } catch (error) {
      console.error('Failed to record member payment:', error);
      res.status(500).json({ error: 'Unable to record member payment.' });
    }
  }
);
