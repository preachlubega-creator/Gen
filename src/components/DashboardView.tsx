import { ArrowRight, CheckCircle2, Clock } from 'lucide-react';
import type {
  AuditLogDto,
  MemberDto,
  OrgFinanceSummary,
  ProjectDto,
} from '../domain/types.ts';
import { formatCurrency } from '../lib/format.ts';
import { FundingCompositionBar, SectorFinanceComparisonChart } from './Charts.tsx';
import type { ActiveNav } from './Sidebar.tsx';

interface DashboardViewProps {
  financeSummary: OrgFinanceSummary;
  members: MemberDto[];
  projects: ProjectDto[];
  auditLogs: AuditLogDto[];
  onNavigate: (nav: ActiveNav) => void;
}

export function DashboardView({
  financeSummary,
  members,
  projects,
  auditLogs,
  onNavigate,
}: DashboardViewProps) {
  const paidCount = members.filter((m) => m.paymentStatus === 'paid').length;
  const partialCount = members.filter(
    (m) => m.paymentStatus === 'partially_paid'
  ).length;
  const unpaidCount = members.filter((m) => m.paymentStatus === 'unpaid').length;

  const totalExternalAndGrants =
    financeSummary.externalFunding + financeSummary.donationsAndGrants;

  return (
    <div className="space-y-8">
      {/* Top 4-column financial & membership strip */}
      <section aria-label="Key organisational metrics">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-lg p-5">
            <p className="text-xs font-medium text-slate-500">
              Current Available Balance
            </p>
            <p className="mt-2 text-2xl font-display font-bold font-mono tabular-nums text-slate-900">
              {formatCurrency(financeSummary.currentAvailableBalance)}
            </p>
            <p className="mt-2 text-xs text-slate-500 font-mono tabular-nums">
              Inflows {formatCurrency(financeSummary.totalInflows)} · Spend{' '}
              {formatCurrency(financeSummary.totalActualExpenditure)}
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-5">
            <p className="text-xs font-medium text-slate-500">
              Total Funds Allocated vs. Spent
            </p>
            <p className="mt-2 text-2xl font-display font-bold font-mono tabular-nums text-slate-900">
              {formatCurrency(financeSummary.totalFundsAllocated)}
            </p>
            <p className="mt-2 text-xs text-slate-500 font-mono tabular-nums">
              Actual Expenditure {formatCurrency(financeSummary.totalActualExpenditure)}
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-5">
            <p className="text-xs font-medium text-slate-500">
              External Funding & Revenue
            </p>
            <p className="mt-2 text-2xl font-display font-bold font-mono tabular-nums text-emerald-700">
              {formatCurrency(totalExternalAndGrants)}
            </p>
            <p className="mt-2 text-xs text-slate-500 font-mono tabular-nums">
              Revenue Generated {formatCurrency(financeSummary.totalRevenue)}
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-5">
            <p className="text-xs font-medium text-slate-500">
              Registered Members & Dues
            </p>
            <p className="mt-2 text-2xl font-display font-bold font-mono tabular-nums text-slate-900">
              {members.length}
            </p>
            <p className="mt-2 text-xs text-slate-500 font-mono tabular-nums">
              Contributions {formatCurrency(financeSummary.membershipContributions)} ·{' '}
              {paidCount} Paid / {partialCount} Partial / {unpaidCount} Unpaid
            </p>
          </div>
        </div>
      </section>

      {/* Main Analytics Split */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <section className="xl:col-span-2 bg-white border border-slate-200 rounded-lg p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Sector Financial Comparisons
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Budget allocated vs. approved operational & project expenditure and revenue
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate({ view: 'finance' })}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 hover:text-emerald-800 whitespace-nowrap shrink-0"
            >
              <span>Open Central Ledger</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <SectorFinanceComparisonChart sectors={financeSummary.sectorBreakdown} />

          <div className="overflow-x-auto pt-2">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500">
                  <th className="py-2.5 pr-4 font-medium">Sector</th>
                  <th className="py-2.5 px-3 font-medium text-right">Members</th>
                  <th className="py-2.5 px-3 font-medium text-right">Allocated</th>
                  <th className="py-2.5 px-3 font-medium text-right">Actual Spend</th>
                  <th className="py-2.5 px-3 font-medium text-right">Remaining</th>
                  <th className="py-2.5 pl-3 font-medium text-right">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {financeSummary.sectorBreakdown.map((sec) => {
                  const totalSpend = sec.actualExpenditure + sec.projectInvestment;
                  return (
                    <tr key={sec.sectorId} className="hover:bg-slate-50/80">
                      <td className="py-2.5 pr-4 font-medium text-slate-900">
                        <button
                          type="button"
                          onClick={() =>
                            onNavigate({
                              view: 'sector',
                              sectorSlug: sec.sectorSlug,
                            })
                          }
                          className="hover:text-emerald-700 transition-colors text-left"
                        >
                          {sec.sectorName}
                        </button>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700">
                        {sec.memberCount}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-900">
                        {formatCurrency(sec.allocated)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-amber-700">
                        {formatCurrency(totalSpend)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700">
                        {formatCurrency(sec.remainingAllocation)}
                      </td>
                      <td className="py-2.5 pl-3 text-right font-mono tabular-nums text-emerald-700 font-medium">
                        {formatCurrency(sec.revenue)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="bg-white border border-slate-200 rounded-lg p-6 space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="text-base font-semibold text-slate-900">
              Inflow Sources & Allocation Pool
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Total inflows {formatCurrency(financeSummary.totalInflows)} · Unallocated{' '}
              {formatCurrency(financeSummary.unallocatedPool)}
            </p>
          </div>

          <FundingCompositionBar summary={financeSummary} />

          <div className="pt-3 border-t border-slate-100 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">
                Approval Queue
              </h3>
              <button
                type="button"
                onClick={() => onNavigate({ view: 'finance' })}
                className="text-xs font-medium text-emerald-700 hover:text-emerald-800 whitespace-nowrap shrink-0"
              >
                Review All
              </button>
            </div>
            {financeSummary.pendingApprovalCount > 0 ? (
              <div className="flex items-center justify-between bg-amber-50/70 border border-amber-200 rounded-md px-3.5 py-2.5 text-xs text-amber-900">
                <span className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-amber-600 shrink-0" />
                  <span>
                    <strong className="font-mono tabular-nums">
                      {financeSummary.pendingApprovalCount}
                    </strong>{' '}
                    pending transaction(s) awaiting review
                  </span>
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-emerald-700 py-1">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>All submitted transactions are settled.</span>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Bottom Row: Project Performance & Recent Activity */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <section className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Project Performance
              </h2>
              <p className="text-xs text-slate-500">
                Budget utilization and milestone progress across sectors
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate({ view: 'projects' })}
              className="text-xs font-medium text-emerald-700 hover:text-emerald-800 whitespace-nowrap shrink-0"
            >
              All Projects
            </button>
          </div>

          <div className="divide-y divide-slate-100">
            {projects.slice(0, 5).map((project) => {
              const budgetPct =
                project.budget > 0
                  ? Math.min(
                      100,
                      Math.round((project.expenditure / project.budget) * 100)
                    )
                  : 0;
              return (
                <div key={project.id} className="py-3.5 space-y-2">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {project.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {project.sectorName} · {project.code} · Lead:{' '}
                        {project.managerName ?? 'Unassigned'}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-mono tabular-nums font-semibold text-slate-900">
                        {project.latestProgressPct}% complete
                      </p>
                      <p className="text-xs font-mono tabular-nums text-slate-500">
                        {formatCurrency(project.expenditure)} /{' '}
                        {formatCurrency(project.budget)}
                      </p>
                    </div>
                  </div>
                  <div className="h-1.5 w-full bg-slate-100 rounded-sm overflow-hidden">
                    <div
                      className="h-full bg-emerald-600"
                      style={{ width: `${project.latestProgressPct}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono tabular-nums">
                    <span>Budget spent: {budgetPct}%</span>
                    <span>Revenue: {formatCurrency(project.revenue)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Recent Organisational Activity
              </h2>
              <p className="text-xs text-slate-500">
                Immutable audit trail of recent administrative & financial actions
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate({ view: 'governance' })}
              className="text-xs font-medium text-emerald-700 hover:text-emerald-800 whitespace-nowrap shrink-0"
            >
              View Audit Log
            </button>
          </div>

          <div className="divide-y divide-slate-100">
            {auditLogs.slice(0, 7).map((log) => (
              <div key={log.id} className="py-3 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm text-slate-800">{log.summary}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {log.actorEmail} · {log.action.replace(/_/g, ' ').toLowerCase()}
                    {log.sectorName ? ` · ${log.sectorName}` : ''}
                  </p>
                </div>
                <time className="text-xs font-mono tabular-nums text-slate-400 shrink-0">
                  {new Date(log.createdAt).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  })}
                </time>
              </div>
            ))}
            {auditLogs.length === 0 && (
              <p className="py-6 text-sm text-slate-500">
                No administrative activity recorded yet.
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
