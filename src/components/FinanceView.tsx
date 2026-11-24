import { useMemo, useState } from 'react';
import {
  Check,
  Plus,
  RotateCcw,
  Search,
  X,
} from 'lucide-react';
import type {
  FinancialTransactionDto,
  OrgFinanceSummary,
  ProjectDto,
  SectorDto,
  TransactionType,
  UserAccessContext,
} from '../domain/types.ts';
import { hasPermission } from '../domain/calculations.ts';
import {
  formatCurrency,
  formatTxTypeLabel,
  todayIsoDate,
} from '../lib/format.ts';

interface FinanceViewProps {
  summary: OrgFinanceSummary;
  transactions: FinancialTransactionDto[];
  sectors: SectorDto[];
  projects: ProjectDto[];
  access: UserAccessContext;
  onCreateTransaction: (payload: {
    reference: string;
    txType: TransactionType;
    amount: number;
    txDate: string;
    description: string;
    sectorId: number | null;
    projectId: number | null;
    counterparty: string;
    approveImmediately: boolean;
  }) => Promise<void>;
  onDecideTransaction: (
    id: number,
    decision: 'approved' | 'rejected',
    rejectionReason?: string
  ) => Promise<void>;
  onReverseTransaction: (id: number, reason: string) => Promise<void>;
}

export function FinanceView({
  summary,
  transactions,
  sectors,
  projects,
  access,
  onCreateTransaction,
  onDecideTransaction,
  onReverseTransaction,
}: FinanceViewProps) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [sectorFilter, setSectorFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [reverseTarget, setReverseTarget] =
    useState<FinancialTransactionDto | null>(null);
  const [reverseReason, setReverseReason] = useState('');
  const [rejectTarget, setRejectTarget] =
    useState<FinancialTransactionDto | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Create transaction fields
  const [reference, setReference] = useState('');
  const [txType, setTxType] = useState<TransactionType>('operational_expense');
  const [amount, setAmount] = useState('');
  const [txDate, setTxDate] = useState(todayIsoDate());
  const [description, setDescription] = useState('');
  const [sectorId, setSectorId] = useState<string>('');
  const [projectId, setProjectId] = useState<string>('');
  const [counterparty, setCounterparty] = useState('');
  const [approveImmediately, setApproveImmediately] = useState(false);

  const canRecord = hasPermission(access, 'finance.record');
  const canApprove = hasPermission(access, 'finance.approve');

  const reversedIds = useMemo(() => {
    const set = new Set<number>();
    for (const tx of transactions) {
      if (tx.txType === 'reversal' && tx.reversedTransactionId) {
        set.add(tx.reversedTransactionId);
      }
    }
    return set;
  }, [transactions]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return transactions.filter((t) => {
      if (typeFilter !== 'all' && t.txType !== typeFilter) return false;
      if (sectorFilter !== 'all') {
        if (sectorFilter === 'org' && t.sectorId !== null) return false;
        if (sectorFilter !== 'org' && String(t.sectorId) !== sectorFilter)
          return false;
      }
      if (statusFilter !== 'all' && t.approvalStatus !== statusFilter)
        return false;
      if (q) {
        const hay = `${t.reference} ${t.description} ${t.counterparty} ${
          t.sectorName ?? ''
        }`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [transactions, search, typeFilter, sectorFilter, statusFilter]);

  const openNewTx = () => {
    setErrorMsg(null);
    setReference(`TX-${Date.now().toString().slice(-6)}`);
    setTxType('operational_expense');
    setAmount('');
    setTxDate(todayIsoDate());
    setDescription('');
    setSectorId(sectors[0] ? String(sectors[0].id) : '');
    setProjectId('');
    setCounterparty('');
    setApproveImmediately(false);
    setShowCreateModal(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);
    try {
      await onCreateTransaction({
        reference: reference.trim(),
        txType,
        amount: Number(amount),
        txDate,
        description: description.trim(),
        sectorId: sectorId ? Number(sectorId) : null,
        projectId: projectId ? Number(projectId) : null,
        counterparty: counterparty.trim(),
        approveImmediately,
      });
      setShowCreateModal(false);
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Unable to record transaction.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleReverse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reverseTarget) return;
    setErrorMsg(null);
    setSubmitting(true);
    try {
      await onReverseTransaction(reverseTarget.id, reverseReason.trim());
      setReverseTarget(null);
      setReverseReason('');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Reversal failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectTarget) return;
    setErrorMsg(null);
    setSubmitting(true);
    try {
      await onDecideTransaction(
        rejectTarget.id,
        'rejected',
        rejectReason.trim()
      );
      setRejectTarget(null);
      setRejectReason('');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Rejection failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Clarity Banner: Allocated vs Actual Expenditure */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs text-slate-500">Total Funds Allocated</p>
          <p className="mt-1.5 text-xl font-bold font-mono tabular-nums text-slate-900">
            {formatCurrency(summary.totalFundsAllocated)}
          </p>
          <p className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
            Unallocated pool: {formatCurrency(summary.unallocatedPool)}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs text-slate-500">Actual Expenditure (Approved)</p>
          <p className="mt-1.5 text-xl font-bold font-mono tabular-nums text-amber-700">
            {formatCurrency(summary.totalActualExpenditure)}
          </p>
          <p className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
            Ops {formatCurrency(summary.totalOperationalExpenditure)} · Projects{' '}
            {formatCurrency(summary.totalProjectInvestment)}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs text-slate-500">Total Revenue & Contributions</p>
          <p className="mt-1.5 text-xl font-bold font-mono tabular-nums text-emerald-700">
            {formatCurrency(
              summary.totalRevenue + summary.membershipContributions
            )}
          </p>
          <p className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
            Grants & External:{' '}
            {formatCurrency(
              summary.donationsAndGrants + summary.externalFunding
            )}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <p className="text-xs text-slate-500">Current Available Cash</p>
          <p className="mt-1.5 text-xl font-bold font-mono tabular-nums text-slate-900">
            {formatCurrency(summary.currentAvailableBalance)}
          </p>
          <p className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
            Pending approvals: {summary.pendingApprovalCount}
          </p>
        </div>
      </div>

      {/* Filters & Action Bar */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 flex-1">
          <div className="relative min-w-[210px] flex-1 max-w-xs">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              aria-label="Search financial ledger"
              placeholder="Search ref, description, counterparty..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-md"
            />
          </div>

          <select
            aria-label="Filter by transaction type"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-md"
          >
            <option value="all">All Types</option>
            <option value="membership_contribution">Membership Contribution</option>
            <option value="external_funding">External Funding</option>
            <option value="donation_grant">Donation / Grant</option>
            <option value="sector_allocation">Sector Allocation</option>
            <option value="operational_expense">Operational Expense</option>
            <option value="project_investment">Project Investment</option>
            <option value="revenue">Revenue</option>
            <option value="reversal">Reversal</option>
          </select>

          <select
            aria-label="Filter by sector scope"
            value={sectorFilter}
            onChange={(e) => setSectorFilter(e.target.value)}
            className="px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-md"
          >
            <option value="all">All Scopes</option>
            <option value="org">Organisation-Wide</option>
            {sectors.map((s) => (
              <option key={s.id} value={String(s.id)}>
                {s.name}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter by approval status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-md"
          >
            <option value="all">All Statuses</option>
            <option value="approved">Approved</option>
            <option value="pending">Pending Approval</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>

        {canRecord && (
          <button
            type="button"
            onClick={openNewTx}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-md whitespace-nowrap shrink-0"
          >
            <Plus className="h-4 w-4" />
            <span>Record Transaction</span>
          </button>
        )}
      </div>

      {/* Central Transaction Ledger */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                <th className="py-3 px-4 font-medium">Reference & Date</th>
                <th className="py-3 px-4 font-medium">Type & Scope</th>
                <th className="py-3 px-4 font-medium">Description</th>
                <th className="py-3 px-4 font-medium text-right">Amount</th>
                <th className="py-3 px-4 font-medium">Status</th>
                <th className="py-3 px-4 font-medium text-right">Controls</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((tx) => {
                const isReversed = reversedIds.has(tx.id);
                const isOutflow =
                  tx.txType === 'operational_expense' ||
                  tx.txType === 'project_investment';
                return (
                  <tr
                    key={tx.id}
                    className={`hover:bg-slate-50/70 ${
                      isReversed ? 'opacity-60' : ''
                    }`}
                  >
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="font-mono text-xs font-semibold text-slate-900">
                        {tx.reference}
                      </div>
                      <div className="text-xs font-mono text-slate-500">
                        {tx.txDate}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-xs font-medium text-slate-900">
                        {formatTxTypeLabel(tx.txType)}
                      </div>
                      <div className="text-xs text-slate-500">
                        {tx.sectorName ?? 'Organisation'}
                        {tx.projectName ? ` · ${tx.projectName}` : ''}
                      </div>
                    </td>
                    <td className="py-3 px-4 max-w-md">
                      <p className="text-slate-800">{tx.description}</p>
                      <p className="text-xs text-slate-500">
                        {tx.counterparty ? `${tx.counterparty} · ` : ''}
                        Recorded by {tx.recordedByEmail ?? 'system'}
                      </p>
                    </td>
                    <td
                      className={`py-3 px-4 text-right font-mono tabular-nums font-semibold whitespace-nowrap ${
                        isOutflow
                          ? 'text-amber-700'
                          : tx.txType === 'sector_allocation'
                          ? 'text-slate-800'
                          : 'text-emerald-700'
                      }`}
                    >
                      {isOutflow ? '-' : ''}
                      {formatCurrency(tx.amount)}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {isReversed ? (
                        <span className="text-xs font-medium text-slate-500">
                          Reversed
                        </span>
                      ) : tx.approvalStatus === 'approved' ? (
                        <span className="text-xs font-medium text-emerald-700">
                          Approved
                        </span>
                      ) : tx.approvalStatus === 'pending' ? (
                        <span className="text-xs font-medium text-amber-700">
                          Pending Approval
                        </span>
                      ) : (
                        <span className="text-xs font-medium text-red-700">
                          Rejected
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      {tx.approvalStatus === 'pending' && canApprove && (
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              onDecideTransaction(tx.id, 'approved')
                            }
                            aria-label={`Approve ${tx.reference}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-sm"
                          >
                            <Check className="h-3 w-3" />
                            <span>Approve</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setErrorMsg(null);
                              setRejectReason('');
                              setRejectTarget(tx);
                            }}
                            aria-label={`Reject ${tx.reference}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-sm"
                          >
                            <X className="h-3 w-3" />
                            <span>Reject</span>
                          </button>
                        </div>
                      )}
                      {tx.approvalStatus === 'approved' &&
                        tx.txType !== 'reversal' &&
                        !isReversed &&
                        canApprove && (
                          <button
                            type="button"
                            onClick={() => {
                              setErrorMsg(null);
                              setReverseReason('');
                              setReverseTarget(tx);
                            }}
                            className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900"
                          >
                            <RotateCcw className="h-3 w-3" />
                            <span>Reverse</span>
                          </button>
                        )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="py-10 px-4 text-center text-sm text-slate-500"
                  >
                    No financial transactions match the selected filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Record Transaction Modal */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Record financial transaction"
        >
          <div className="bg-white border border-slate-200 rounded-lg w-full max-w-xl max-h-[90vh] overflow-y-auto p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Record Financial Transaction
                </h2>
                <p className="text-xs text-slate-500">
                  Unique ledger reference enforced · Expenses enter approval queue unless pre-authorized
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                aria-label="Close transaction modal"
                className="p-1.5 rounded-md text-slate-400 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {errorMsg && (
              <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                {errorMsg}
              </p>
            )}

            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="tx-ref"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Transaction Reference
                  </label>
                  <input
                    id="tx-ref"
                    type="text"
                    required
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md font-mono"
                  />
                </div>
                <div>
                  <label
                    htmlFor="tx-type"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Transaction Type
                  </label>
                  <select
                    id="tx-type"
                    value={txType}
                    onChange={(e) =>
                      setTxType(e.target.value as TransactionType)
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md"
                  >
                    <option value="operational_expense">
                      Operational Expense
                    </option>
                    <option value="project_investment">
                      Project Investment
                    </option>
                    <option value="revenue">Revenue Generated</option>
                    <option value="external_funding">External Funding</option>
                    <option value="donation_grant">Donation / Grant</option>
                    {canApprove && (
                      <option value="sector_allocation">
                        Sector Allocation
                      </option>
                    )}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="tx-amount"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Amount (USD)
                  </label>
                  <input
                    id="tx-amount"
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md font-mono tabular-nums"
                    placeholder="450.00"
                  />
                </div>
                <div>
                  <label
                    htmlFor="tx-date"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Transaction Date
                  </label>
                  <input
                    id="tx-date"
                    type="date"
                    required
                    value={txDate}
                    onChange={(e) => setTxDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md font-mono"
                  />
                </div>

                <div>
                  <label
                    htmlFor="tx-sector"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Sector Scope
                  </label>
                  <select
                    id="tx-sector"
                    value={sectorId}
                    onChange={(e) => setSectorId(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md"
                  >
                    <option value="">Organisation-Wide</option>
                    {sectors.map((s) => (
                      <option key={s.id} value={String(s.id)}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="tx-project"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Linked Project (Optional)
                  </label>
                  <select
                    id="tx-project"
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md"
                  >
                    <option value="">None</option>
                    {projects.map((p) => (
                      <option key={p.id} value={String(p.id)}>
                        {p.code} — {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label
                  htmlFor="tx-counterparty"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Vendor / Donor / Counterparty
                </label>
                <input
                  id="tx-counterparty"
                  type="text"
                  value={counterparty}
                  onChange={(e) => setCounterparty(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md"
                  placeholder="e.g. AgroInputs Co-op"
                />
              </div>

              <div>
                <label
                  htmlFor="tx-desc"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Description
                </label>
                <textarea
                  id="tx-desc"
                  rows={2}
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md"
                  placeholder="Clear audit description of transaction purpose"
                />
              </div>

              {canApprove &&
                (txType === 'operational_expense' ||
                  txType === 'project_investment') && (
                  <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={approveImmediately}
                      onChange={(e) => setApproveImmediately(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-emerald-700"
                    />
                    <span>Approve immediately upon posting</span>
                  </label>
                )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-sm font-medium text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 rounded-md"
                >
                  {submitting ? 'Posting...' : 'Post to Ledger'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reversal Modal */}
      {reverseTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Reverse transaction"
        >
          <div className="bg-white border border-slate-200 rounded-lg w-full max-w-md p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-900">
              Post Immutable Reversal for {reverseTarget.reference}
            </h2>
            <p className="text-xs text-slate-600">
              Original records are never deleted. Posting a reversal creates an
              offsetting audit entry for {formatCurrency(reverseTarget.amount)}.
            </p>
            {errorMsg && (
              <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                {errorMsg}
              </p>
            )}
            <form onSubmit={handleReverse} className="space-y-3">
              <div>
                <label
                  htmlFor="rev-reason"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Reversal Reason
                </label>
                <textarea
                  id="rev-reason"
                  rows={2}
                  required
                  value={reverseReason}
                  onChange={(e) => setReverseReason(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md"
                  placeholder="Explain why this entry is being reversed"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setReverseTarget(null)}
                  className="px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 rounded-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md"
                >
                  {submitting ? 'Posting...' : 'Confirm Reversal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Reject pending transaction"
        >
          <div className="bg-white border border-slate-200 rounded-lg w-full max-w-md p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-900">
              Reject {rejectTarget.reference}
            </h2>
            {errorMsg && (
              <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                {errorMsg}
              </p>
            )}
            <form onSubmit={handleReject} className="space-y-3">
              <div>
                <label
                  htmlFor="rej-reason"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Rejection Reason
                </label>
                <textarea
                  id="rej-reason"
                  rows={2}
                  required
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRejectTarget(null)}
                  className="px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 rounded-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-medium text-white bg-red-700 hover:bg-red-800 rounded-md"
                >
                  {submitting ? 'Rejecting...' : 'Reject Transaction'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
