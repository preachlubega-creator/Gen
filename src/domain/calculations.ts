import type {
  ApprovalStatus,
  OrgFinanceSummary,
  PaymentStatus,
  SectorDto,
  SectorFinanceSummary,
  TransactionType,
  UserAccessContext,
} from './types.ts';

export function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function computeMemberPaymentSummary(
  contributionRequiredInput: number | string,
  payments: Array<{ amount: number | string }>
): {
  contributionRequired: number;
  amountPaid: number;
  outstandingBalance: number;
  paymentStatus: PaymentStatus;
} {
  const contributionRequired = Math.max(0, roundCurrency(Number(contributionRequiredInput) || 0));
  const amountPaid = roundCurrency(
    payments.reduce((sum, p) => sum + Math.max(0, Number(p.amount) || 0), 0)
  );
  const outstandingBalance = roundCurrency(Math.max(0, contributionRequired - amountPaid));

  let paymentStatus: PaymentStatus = 'unpaid';
  if (contributionRequired === 0 || amountPaid >= contributionRequired) {
    paymentStatus = 'paid';
  } else if (amountPaid > 0) {
    paymentStatus = 'partially_paid';
  }

  return {
    contributionRequired,
    amountPaid,
    outstandingBalance,
    paymentStatus,
  };
}

export interface LedgerTransactionInput {
  id: number;
  txType: TransactionType | string;
  amount: number | string;
  sectorId: number | null;
  approvalStatus: ApprovalStatus | string;
  reversedTransactionId?: number | null;
}

export function computeLedgerSummary(
  transactions: LedgerTransactionInput[],
  sectors: SectorDto[],
  memberCountsBySector: Record<number, number> = {}
): OrgFinanceSummary {
  const reversedIds = new Set<number>();
  for (const tx of transactions) {
    if (
      tx.txType === 'reversal' &&
      tx.approvalStatus === 'approved' &&
      tx.reversedTransactionId != null
    ) {
      reversedIds.add(tx.reversedTransactionId);
    }
  }

  let membershipContributions = 0;
  let externalFunding = 0;
  let donationsAndGrants = 0;
  let totalFundsAllocated = 0;
  let totalOperationalExpenditure = 0;
  let totalProjectInvestment = 0;
  let totalRevenue = 0;
  let pendingApprovalCount = 0;

  const sectorBuckets = new Map<number, SectorFinanceSummary>();
  for (const sector of sectors) {
    sectorBuckets.set(sector.id, {
      sectorId: sector.id,
      sectorSlug: sector.slug,
      sectorName: sector.name,
      memberCount: memberCountsBySector[sector.id] ?? 0,
      allocated: 0,
      actualExpenditure: 0,
      projectInvestment: 0,
      revenue: 0,
      remainingAllocation: 0,
      netPosition: 0,
      pendingCount: 0,
    });
  }

  for (const tx of transactions) {
    if (tx.approvalStatus === 'pending') {
      pendingApprovalCount += 1;
      if (tx.sectorId && sectorBuckets.has(tx.sectorId)) {
        sectorBuckets.get(tx.sectorId)!.pendingCount += 1;
      }
      continue;
    }

    if (tx.approvalStatus !== 'approved') {
      continue;
    }

    // Reversed transactions are excluded from net totals while remaining immutable in history
    if (reversedIds.has(tx.id) || tx.txType === 'reversal') {
      continue;
    }

    const amt = Math.max(0, Number(tx.amount) || 0);
    const sectorBucket = tx.sectorId ? sectorBuckets.get(tx.sectorId) : undefined;

    switch (tx.txType) {
      case 'membership_contribution':
        membershipContributions += amt;
        break;
      case 'external_funding':
        externalFunding += amt;
        break;
      case 'donation_grant':
        donationsAndGrants += amt;
        break;
      case 'sector_allocation':
        totalFundsAllocated += amt;
        if (sectorBucket) {
          sectorBucket.allocated += amt;
        }
        break;
      case 'operational_expense':
        totalOperationalExpenditure += amt;
        if (sectorBucket) {
          sectorBucket.actualExpenditure += amt;
        }
        break;
      case 'project_investment':
        totalProjectInvestment += amt;
        if (sectorBucket) {
          sectorBucket.projectInvestment += amt;
        }
        break;
      case 'revenue':
        totalRevenue += amt;
        if (sectorBucket) {
          sectorBucket.revenue += amt;
        }
        break;
    }
  }

  const totalInflows = roundCurrency(
    membershipContributions + externalFunding + donationsAndGrants + totalRevenue
  );
  const totalActualExpenditure = roundCurrency(
    totalOperationalExpenditure + totalProjectInvestment
  );
  const currentAvailableBalance = roundCurrency(totalInflows - totalActualExpenditure);
  const unallocatedPool = roundCurrency(totalInflows - totalFundsAllocated);

  const sectorBreakdown = Array.from(sectorBuckets.values()).map((bucket) => {
    const totalSectorSpend = roundCurrency(
      bucket.actualExpenditure + bucket.projectInvestment
    );
    return {
      ...bucket,
      allocated: roundCurrency(bucket.allocated),
      actualExpenditure: roundCurrency(bucket.actualExpenditure),
      projectInvestment: roundCurrency(bucket.projectInvestment),
      revenue: roundCurrency(bucket.revenue),
      remainingAllocation: roundCurrency(bucket.allocated - totalSectorSpend),
      netPosition: roundCurrency(bucket.revenue - totalSectorSpend),
    };
  });

  return {
    membershipContributions: roundCurrency(membershipContributions),
    externalFunding: roundCurrency(externalFunding),
    donationsAndGrants: roundCurrency(donationsAndGrants),
    totalInflows,
    totalFundsAllocated: roundCurrency(totalFundsAllocated),
    unallocatedPool,
    totalOperationalExpenditure: roundCurrency(totalOperationalExpenditure),
    totalProjectInvestment: roundCurrency(totalProjectInvestment),
    totalActualExpenditure,
    totalRevenue: roundCurrency(totalRevenue),
    currentAvailableBalance,
    pendingApprovalCount,
    sectorBreakdown,
  };
}

export function hasPermission(
  access: UserAccessContext | null | undefined,
  permissionKey: string,
  targetSectorId?: number | null
): boolean {
  if (!access) return false;

  if (access.globalRoleSlug === 'founder') {
    return true;
  }

  if (access.globalPermissionKeys.includes(permissionKey)) {
    // Global admins/founders can operate across sectors
    if (access.isGlobalAdmin) {
      return true;
    }
    if (targetSectorId == null) {
      return true;
    }
  }

  if (targetSectorId != null) {
    const sectorEntry = access.sectorRoles.find(
      (sr) => sr.sectorId === targetSectorId
    );
    if (sectorEntry && sectorEntry.permissionKeys.includes(permissionKey)) {
      return true;
    }
    return false;
  }

  return access.sectorRoles.some((sr) =>
    sr.permissionKeys.includes(permissionKey)
  );
}

const VALID_TX_TYPES = new Set<string>([
  'membership_contribution',
  'external_funding',
  'donation_grant',
  'sector_allocation',
  'operational_expense',
  'project_investment',
  'revenue',
  'reversal',
]);

export function validateTransactionInput(input: {
  reference?: string;
  txType?: string;
  amount?: number | string;
  txDate?: string;
  description?: string;
  sectorId?: number | null;
  projectId?: number | null;
}): { ok: true } | { ok: false; error: string } {
  const reference = (input.reference ?? '').trim();
  if (!reference || reference.length < 3 || reference.length > 64) {
    return {
      ok: false,
      error: 'Transaction reference must be between 3 and 64 characters.',
    };
  }
  if (!input.txType || !VALID_TX_TYPES.has(input.txType)) {
    return { ok: false, error: 'Invalid transaction type.' };
  }
  const numericAmount = Number(input.amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return {
      ok: false,
      error: 'Transaction amount must be a positive number.',
    };
  }
  if (!input.txDate || !/^\d{4}-\d{2}-\d{2}$/.test(input.txDate)) {
    return { ok: false, error: 'Date must follow YYYY-MM-DD format.' };
  }
  if (!input.description || input.description.trim().length < 3) {
    return {
      ok: false,
      error: 'Description must be at least 3 characters.',
    };
  }
  if (input.txType === 'sector_allocation' && !input.sectorId) {
    return {
      ok: false,
      error: 'Sector allocation transactions require a target sector.',
    };
  }
  if (input.txType === 'project_investment' && !input.projectId) {
    return {
      ok: false,
      error: 'Project investment transactions require a target project.',
    };
  }
  return { ok: true };
}

function escapeCsvCell(raw: string | number | boolean | null | undefined): string {
  let str = raw == null ? '' : String(raw);
  // Neutralize spreadsheet formula injection characters
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildCsvReport(
  headers: string[],
  rows: Array<Array<string | number | boolean | null | undefined>>
): string {
  const headerLine = headers.map((h) => escapeCsvCell(h)).join(',');
  const dataLines = rows.map((row) =>
    row.map((cell) => escapeCsvCell(cell)).join(',')
  );
  return [headerLine, ...dataLines].join('\r\n');
}
