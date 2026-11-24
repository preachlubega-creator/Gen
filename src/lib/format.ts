export function formatCurrency(value: number | string | null | undefined): string {
  const num = Number(value) || 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(num);
}

export function formatNumber(value: number | string | null | undefined): string {
  const num = Number(value) || 0;
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
  }).format(num);
}

export function formatTxTypeLabel(txType: string): string {
  const labels: Record<string, string> = {
    membership_contribution: 'Membership Contribution',
    external_funding: 'External Funding',
    donation_grant: 'Donation / Grant',
    sector_allocation: 'Sector Allocation',
    operational_expense: 'Operational Expense',
    project_investment: 'Project Investment',
    revenue: 'Revenue',
    reversal: 'Reversal Entry',
  };
  return labels[txType] ?? txType.replace(/_/g, ' ');
}

export function formatPaymentStatusLabel(status: string): string {
  if (status === 'paid') return 'Paid';
  if (status === 'partially_paid') return 'Partially Paid';
  return 'Unpaid';
}

export function formatRoleLabel(slug: string): string {
  const map: Record<string, string> = {
    founder: 'Founder / Super Admin',
    admin: 'Administrator',
    sector_manager: 'Sector Manager',
    team_leader: 'Team Leader',
    member: 'General Member',
  };
  return map[slug] ?? slug;
}

export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}
