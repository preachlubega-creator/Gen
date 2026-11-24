import { Router } from 'express';
import { asc, eq } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import {
  agricultureRecords,
  financialTransactions,
  memberPayments,
  members,
  memberSectorRoles,
  piggeryRecords,
  poultryRecords,
  projects,
  roles,
  sectors,
  verticalFarmingRecords,
} from '../../db/schema.ts';
import {
  buildCsvReport,
  computeLedgerSummary,
  computeMemberPaymentSummary,
} from '../../domain/calculations.ts';
import {
  requireAuth,
  requirePermission,
  type AuthRequest,
} from '../middleware/auth.ts';
import { ensureSeeded } from '../seed.ts';
import { recordAuditLog } from './audit.ts';

export const reportsRouter = Router();

reportsRouter.get(
  '/:reportType',
  requireAuth,
  requirePermission('reports.export'),
  async (req: AuthRequest, res) => {
    const { reportType } = req.params;
    const format = req.query.format === 'csv' ? 'csv' : 'json';

    try {
      await ensureSeeded();

      const [
        sectorRows,
        memberRows,
        assignmentRows,
        paymentRows,
        txRows,
        projectRows,
        agRows,
        pigRows,
        poultryRows,
        vfRows,
      ] = await Promise.all([
        db.select().from(sectors).orderBy(asc(sectors.id)),
        db.select().from(members).orderBy(asc(members.fullName)),
        db
          .select({
            memberId: memberSectorRoles.memberId,
            sectorId: memberSectorRoles.sectorId,
            sectorName: sectors.name,
            roleName: roles.name,
          })
          .from(memberSectorRoles)
          .innerJoin(sectors, eq(memberSectorRoles.sectorId, sectors.id))
          .innerJoin(roles, eq(memberSectorRoles.roleId, roles.id)),
        db.select().from(memberPayments),
        db.select().from(financialTransactions),
        db.select().from(projects),
        db.select().from(agricultureRecords),
        db.select().from(piggeryRecords),
        db.select().from(poultryRecords),
        db.select().from(verticalFarmingRecords),
      ]);

      const memberCountsBySector: Record<number, number> = {};
      for (const a of assignmentRows) {
        memberCountsBySector[a.sectorId] =
          (memberCountsBySector[a.sectorId] ?? 0) + 1;
      }

      const ledgerSummary = computeLedgerSummary(
        txRows,
        sectorRows,
        memberCountsBySector
      );

      let title = '';
      let columns: string[] = [];
      let rows: Array<Array<string | number>> = [];

      switch (reportType) {
        case 'membership': {
          title = 'Organisational Membership Roster';
          columns = [
            'Member Code',
            'Full Name',
            'Email',
            'Phone',
            'Date Joined',
            'Status',
            'Assigned Sectors & Roles',
          ];
          rows = memberRows.map((m) => {
            const assigns = assignmentRows
              .filter((a) => a.memberId === m.id)
              .map((a) => `${a.sectorName} (${a.roleName})`)
              .join('; ');
            return [
              m.memberCode,
              m.fullName,
              m.email,
              m.phone,
              m.dateJoined,
              m.status,
              assigns,
            ];
          });
          break;
        }

        case 'contributions': {
          title = 'Member Contributions & Balances';
          columns = [
            'Member Code',
            'Full Name',
            'Required ($)',
            'Paid ($)',
            'Outstanding ($)',
            'Payment Status',
            'Installments',
          ];
          rows = memberRows.map((m) => {
            const mPays = paymentRows.filter((p) => p.memberId === m.id);
            const sum = computeMemberPaymentSummary(m.contributionRequired, mPays);
            return [
              m.memberCode,
              m.fullName,
              sum.contributionRequired.toFixed(2),
              sum.amountPaid.toFixed(2),
              sum.outstandingBalance.toFixed(2),
              sum.paymentStatus.replace('_', ' '),
              mPays.length,
            ];
          });
          break;
        }

        case 'sector_finances': {
          title = 'Sector Financial Comparison';
          columns = [
            'Sector',
            'Members',
            'Allocated ($)',
            'Operational Spend ($)',
            'Project Investment ($)',
            'Remaining Allocation ($)',
            'Revenue ($)',
            'Net Position ($)',
          ];
          rows = ledgerSummary.sectorBreakdown.map((b) => [
            b.sectorName,
            b.memberCount,
            b.allocated.toFixed(2),
            b.actualExpenditure.toFixed(2),
            b.projectInvestment.toFixed(2),
            b.remainingAllocation.toFixed(2),
            b.revenue.toFixed(2),
            b.netPosition.toFixed(2),
          ]);
          break;
        }

        case 'project_expenditure': {
          title = 'Project Budgets, Investment & Revenue';
          columns = [
            'Code',
            'Project Name',
            'Sector',
            'Status',
            'Budget ($)',
            'Investment ($)',
            'Expenditure ($)',
            'Revenue ($)',
          ];
          rows = projectRows.map((p) => {
            const sec = sectorRows.find((s) => s.id === p.sectorId)?.name ?? '';
            const relTx = txRows.filter(
              (t) => t.projectId === p.id && t.approvalStatus === 'approved'
            );
            const inv = relTx
              .filter((t) => t.txType === 'project_investment')
              .reduce((a, b) => a + Number(b.amount), 0);
            const exp = relTx
              .filter(
                (t) =>
                  t.txType === 'operational_expense' ||
                  t.txType === 'project_investment'
              )
              .reduce((a, b) => a + Number(b.amount), 0);
            const rev = relTx
              .filter((t) => t.txType === 'revenue')
              .reduce((a, b) => a + Number(b.amount), 0);
            return [
              p.code,
              p.name,
              sec,
              p.status,
              Number(p.budget).toFixed(2),
              inv.toFixed(2),
              exp.toFixed(2),
              rev.toFixed(2),
            ];
          });
          break;
        }

        case 'funding_allocation': {
          title = 'Funding Inflows vs. Sector Allocations';
          columns = [
            'Reference',
            'Date',
            'Type',
            'Sector / Scope',
            'Counterparty',
            'Amount ($)',
            'Status',
          ];
          rows = txRows
            .filter((t) =>
              [
                'membership_contribution',
                'external_funding',
                'donation_grant',
                'sector_allocation',
              ].includes(t.txType)
            )
            .map((t) => {
              const sec =
                sectorRows.find((s) => s.id === t.sectorId)?.name ?? 'Organisation';
              return [
                t.reference,
                t.txDate,
                t.txType.replace(/_/g, ' '),
                sec,
                t.counterparty || '-',
                Number(t.amount).toFixed(2),
                t.approvalStatus,
              ];
            });
          break;
        }

        case 'agricultural_production': {
          title = 'Cross-Sector Production & Yield Summary';
          columns = [
            'Sector',
            'Unit / Batch',
            'Output Metric',
            'Operating / Feed Cost ($)',
            'Sales Revenue ($)',
            'Date',
          ];
          rows = [
            ...agRows.map((r) => [
              'Agriculture',
              `${r.cropName} (${r.plotName})`,
              `${Number(r.actualYieldKg) || Number(r.expectedYieldKg)} kg (${r.stage})`,
              Number(r.inputCost).toFixed(2),
              '0.00',
              r.harvestDate || r.plantingDate,
            ]),
            ...pigRows.map((r) => [
              'Piggery',
              `${r.batchCode} (${r.category})`,
              `${r.headCount} head / ${r.salesCount} sold`,
              (Number(r.feedCost) + Number(r.operatingCost)).toFixed(2),
              Number(r.salesRevenue).toFixed(2),
              r.recordDate,
            ]),
            ...poultryRows.map((r) => [
              'Poultry',
              `${r.flockCode} (${r.birdType})`,
              `${r.birdCount} birds / ${r.eggsCollected} eggs`,
              (Number(r.feedCost) + Number(r.operatingCost)).toFixed(2),
              Number(r.salesRevenue).toFixed(2),
              r.recordDate,
            ]),
            ...vfRows.map((r) => [
              'Vertical Farming',
              `${r.systemName} (${r.cropVariety})`,
              `${Number(r.yieldKg)} kg (pH ${r.nutrientPh})`,
              Number(r.operatingCost).toFixed(2),
              '0.00',
              r.recordDate,
            ]),
          ];
          break;
        }

        case 'organisational_performance':
        default: {
          title = 'Overall Organisational Performance Snapshot';
          columns = ['Metric', 'Value'];
          rows = [
            ['Total Registered Members', memberRows.length],
            ['Active Sectors', sectorRows.filter((s) => s.isActive).length],
            ['Active Projects', projectRows.filter((p) => p.status === 'active').length],
            ['Membership Contributions ($)', ledgerSummary.membershipContributions.toFixed(2)],
            ['External Funding ($)', ledgerSummary.externalFunding.toFixed(2)],
            ['Donations & Grants ($)', ledgerSummary.donationsAndGrants.toFixed(2)],
            ['Total Funds Allocated ($)', ledgerSummary.totalFundsAllocated.toFixed(2)],
            ['Total Actual Expenditure ($)', ledgerSummary.totalActualExpenditure.toFixed(2)],
            ['Total Revenue Generated ($)', ledgerSummary.totalRevenue.toFixed(2)],
            ['Current Available Balance ($)', ledgerSummary.currentAvailableBalance.toFixed(2)],
          ];
          break;
        }
      }

      if (format === 'csv') {
        await recordAuditLog({
          actorUserId: req.access!.userId,
          actorEmail: req.access!.email,
          actorRole: req.access!.globalRoleSlug,
          action: 'REPORT_EXPORTED_CSV',
          entityType: 'report',
          entityId: reportType,
          summary: `Exported CSV report "${title}" (${rows.length} rows).`,
        });

        const csvContent = buildCsvReport(columns, rows);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="genz-agririse-${reportType}.csv"`
        );
        res.send(csvContent);
        return;
      }

      res.json({
        reportType,
        title,
        generatedAt: new Date().toISOString(),
        columns,
        rows,
      });
    } catch (error) {
      console.error('Failed to generate report:', error);
      res.status(500).json({ error: 'Unable to generate report.' });
    }
  }
);
