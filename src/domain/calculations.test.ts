import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCsvReport,
  computeLedgerSummary,
  computeMemberPaymentSummary,
  hasPermission,
  validateTransactionInput,
} from './calculations.ts';
import type { SectorDto, UserAccessContext } from './types.ts';

const SECTORS: SectorDto[] = [
  {
    id: 1,
    slug: 'agriculture',
    name: 'Agriculture',
    description: 'Field crops',
    focusArea: 'Staples & horticulture',
    isActive: true,
  },
  {
    id: 2,
    slug: 'piggery',
    name: 'Piggery',
    description: 'Swine unit',
    focusArea: 'Breeding & fattening',
    isActive: true,
  },
];

test('computeMemberPaymentSummary computes paid, partially_paid, and unpaid accurately', () => {
  const unpaid = computeMemberPaymentSummary(250, []);
  assert.equal(unpaid.amountPaid, 0);
  assert.equal(unpaid.outstandingBalance, 250);
  assert.equal(unpaid.paymentStatus, 'unpaid');

  const partial = computeMemberPaymentSummary(250, [{ amount: 100 }, { amount: 50 }]);
  assert.equal(partial.amountPaid, 150);
  assert.equal(partial.outstandingBalance, 100);
  assert.equal(partial.paymentStatus, 'partially_paid');

  const paid = computeMemberPaymentSummary(250, [{ amount: 250 }]);
  assert.equal(paid.amountPaid, 250);
  assert.equal(paid.outstandingBalance, 0);
  assert.equal(paid.paymentStatus, 'paid');
});

test('computeLedgerSummary separates allocated funds from actual expenditure and excludes pending/rejected/reversed', () => {
  const summary = computeLedgerSummary(
    [
      { id: 1, txType: 'external_funding', amount: 10000, sectorId: null, approvalStatus: 'approved' },
      { id: 2, txType: 'membership_contribution', amount: 1500, sectorId: null, approvalStatus: 'approved' },
      { id: 3, txType: 'sector_allocation', amount: 4000, sectorId: 1, approvalStatus: 'approved' },
      { id: 4, txType: 'operational_expense', amount: 1200, sectorId: 1, approvalStatus: 'approved' },
      { id: 5, txType: 'project_investment', amount: 800, sectorId: 1, approvalStatus: 'approved' },
      { id: 6, txType: 'operational_expense', amount: 9999, sectorId: 1, approvalStatus: 'pending' },
      { id: 7, txType: 'operational_expense', amount: 500, sectorId: 2, approvalStatus: 'rejected' },
      { id: 8, txType: 'revenue', amount: 2200, sectorId: 2, approvalStatus: 'approved' },
      { id: 9, txType: 'operational_expense', amount: 300, sectorId: 2, approvalStatus: 'approved' },
      {
        id: 10,
        txType: 'reversal',
        amount: 300,
        sectorId: 2,
        approvalStatus: 'approved',
        reversedTransactionId: 9,
      },
    ],
    SECTORS,
    { 1: 12, 2: 8 }
  );

  // Total inflows = 10000 + 1500 + 2200 = 13700
  assert.equal(summary.totalInflows, 13700);
  // Allocations do NOT reduce cash balance; only actual expenditure does
  assert.equal(summary.totalFundsAllocated, 4000);
  assert.equal(summary.totalActualExpenditure, 2000);
  assert.equal(summary.currentAvailableBalance, 11700);
  assert.equal(summary.pendingApprovalCount, 1);

  const ag = summary.sectorBreakdown.find((s) => s.sectorId === 1)!;
  assert.equal(ag.allocated, 4000);
  assert.equal(ag.actualExpenditure, 1200);
  assert.equal(ag.projectInvestment, 800);
  assert.equal(ag.remainingAllocation, 2000);
  assert.equal(ag.pendingCount, 1);
  assert.equal(ag.memberCount, 12);

  const pig = summary.sectorBreakdown.find((s) => s.sectorId === 2)!;
  // Reversed expense (#9) and rejected expense (#7) excluded
  assert.equal(pig.actualExpenditure, 0);
  assert.equal(pig.revenue, 2200);
});

test('hasPermission enforces global and sector-scoped RBAC correctly', () => {
  const managerCtx: UserAccessContext = {
    userId: 2,
    uid: 'u-2',
    email: 'lead@agririse.org',
    displayName: 'Grace',
    globalRoleSlug: 'member',
    isGlobalAdmin: false,
    memberId: 5,
    globalPermissionKeys: ['dashboard.view'],
    sectorRoles: [
      {
        sectorId: 1,
        sectorSlug: 'agriculture',
        roleSlug: 'sector_manager',
        permissionKeys: ['operations.write', 'projects.manage', 'finance.record'],
      },
      {
        sectorId: 2,
        sectorSlug: 'piggery',
        roleSlug: 'member',
        permissionKeys: ['operations.view'],
      },
    ],
  };

  assert.equal(hasPermission(managerCtx, 'operations.write', 1), true);
  assert.equal(hasPermission(managerCtx, 'operations.write', 2), false);
  assert.equal(hasPermission(managerCtx, 'finance.approve', 1), false);
  assert.equal(hasPermission(managerCtx, 'dashboard.view'), true);
});

test('validateTransactionInput rejects invalid amounts, dates, and missing sector on allocation', () => {
  assert.equal(
    validateTransactionInput({
      reference: 'TX-1001',
      txType: 'sector_allocation',
      amount: 500,
      txDate: '2026-11-01',
      description: 'Allocate Q4 budget',
      sectorId: null,
    }).ok,
    false
  );

  assert.equal(
    validateTransactionInput({
      reference: 'TX-1002',
      txType: 'external_funding',
      amount: -50,
      txDate: '2026-11-01',
      description: 'Grant',
    }).ok,
    false
  );

  assert.equal(
    validateTransactionInput({
      reference: 'TX-1003',
      txType: 'sector_allocation',
      amount: 1500,
      txDate: '2026-11-01',
      description: 'Allocate Q4 budget to Poultry',
      sectorId: 3,
    }).ok,
    true
  );
});

test('buildCsvReport neutralizes formula injection and escapes commas/quotes', () => {
  const csv = buildCsvReport(
    ['Reference', 'Description', 'Amount'],
    [['TX-1', '=CMD|calc', 450], ['TX-2', 'Feed, "Starter"', 120]]
  );
  assert.equal(
    csv,
    'Reference,Description,Amount\r\nTX-1,\'=CMD|calc,450\r\nTX-2,"Feed, ""Starter""",120'
  );
});
