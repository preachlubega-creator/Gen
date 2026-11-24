export type RoleSlug =
  | 'founder'
  | 'admin'
  | 'sector_manager'
  | 'team_leader'
  | 'member';

export type SectorSlug =
  | 'agriculture'
  | 'piggery'
  | 'poultry'
  | 'vertical_farming';

export type PaymentStatus = 'paid' | 'partially_paid' | 'unpaid';

export type TransactionType =
  | 'membership_contribution'
  | 'external_funding'
  | 'donation_grant'
  | 'sector_allocation'
  | 'operational_expense'
  | 'project_investment'
  | 'revenue'
  | 'reversal';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface SectorDto {
  id: number;
  slug: string;
  name: string;
  description: string;
  focusArea: string;
  isActive: boolean;
}

export interface RoleDto {
  id: number;
  slug: string;
  name: string;
  description: string;
  rank: number;
  isSystem: boolean;
  permissionKeys: string[];
}

export interface PermissionDto {
  id: number;
  key: string;
  label: string;
  module: string;
  description: string;
}

export interface MemberSectorAssignmentDto {
  sectorId: number;
  sectorSlug: string;
  sectorName: string;
  roleId: number;
  roleSlug: string;
  roleName: string;
  isPrimary: boolean;
}

export interface MemberPaymentDto {
  id: number;
  memberId: number;
  transactionId: number;
  amount: number;
  paymentDate: string;
  paymentMethod: string;
  reference: string;
  notes: string;
  recordedByEmail?: string;
}

export interface MemberDto {
  id: number;
  userId: number | null;
  memberCode: string;
  fullName: string;
  email: string;
  phone: string;
  location: string;
  dateJoined: string;
  status: string;
  contributionRequired: number;
  amountPaid: number;
  outstandingBalance: number;
  paymentStatus: PaymentStatus;
  notes: string;
  sectorRoles: MemberSectorAssignmentDto[];
  payments?: MemberPaymentDto[];
}

export interface FinancialTransactionDto {
  id: number;
  reference: string;
  txType: TransactionType;
  amount: number;
  txDate: string;
  description: string;
  sectorId: number | null;
  sectorName?: string | null;
  projectId: number | null;
  projectName?: string | null;
  memberId: number | null;
  memberName?: string | null;
  counterparty: string;
  recordedByUserId: number | null;
  recordedByEmail?: string;
  approvalStatus: ApprovalStatus;
  approvedByUserId: number | null;
  approvedByEmail?: string | null;
  approvedAt: string | null;
  rejectionReason: string;
  reversedTransactionId: number | null;
  createdAt: string;
}

export interface SectorFinanceSummary {
  sectorId: number;
  sectorSlug: string;
  sectorName: string;
  memberCount: number;
  allocated: number;
  actualExpenditure: number;
  projectInvestment: number;
  revenue: number;
  remainingAllocation: number;
  netPosition: number;
  pendingCount: number;
}

export interface OrgFinanceSummary {
  membershipContributions: number;
  externalFunding: number;
  donationsAndGrants: number;
  totalInflows: number;
  totalFundsAllocated: number;
  unallocatedPool: number;
  totalOperationalExpenditure: number;
  totalProjectInvestment: number;
  totalActualExpenditure: number;
  totalRevenue: number;
  currentAvailableBalance: number;
  pendingApprovalCount: number;
  sectorBreakdown: SectorFinanceSummary[];
}

export interface ProjectDto {
  id: number;
  sectorId: number;
  sectorName: string;
  sectorSlug: string;
  managerMemberId: number | null;
  managerName: string | null;
  code: string;
  name: string;
  description: string;
  budget: number;
  investmentReceived: number;
  expenditure: number;
  revenue: number;
  status: string;
  startDate: string;
  targetEndDate: string;
  latestProgressPct: number;
  progressLogs: Array<{
    id: number;
    milestonePct: number;
    summary: string;
    logDate: string;
    loggedByEmail?: string;
  }>;
}

export interface UserAccessContext {
  userId: number;
  uid: string;
  email: string;
  displayName: string;
  globalRoleSlug: string;
  isGlobalAdmin: boolean;
  memberId: number | null;
  globalPermissionKeys: string[];
  sectorRoles: Array<{
    sectorId: number;
    sectorSlug: string;
    roleSlug: string;
    permissionKeys: string[];
  }>;
}

export interface AuditLogDto {
  id: number;
  actorEmail: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  sectorId: number | null;
  sectorName?: string | null;
  summary: string;
  metadataJson: string;
  createdAt: string;
}
