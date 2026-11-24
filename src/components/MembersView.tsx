import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  CreditCard,
  Plus,
  Search,
  UserPlus,
  X,
} from 'lucide-react';
import type {
  MemberDto,
  RoleDto,
  SectorDto,
  UserAccessContext,
} from '../domain/types.ts';
import { hasPermission } from '../domain/calculations.ts';
import {
  formatCurrency,
  formatPaymentStatusLabel,
  todayIsoDate,
} from '../lib/format.ts';

interface MembersViewProps {
  members: MemberDto[];
  sectors: SectorDto[];
  roles: RoleDto[];
  access: UserAccessContext;
  onCreateMember: (payload: {
    fullName: string;
    email: string;
    phone: string;
    location: string;
    dateJoined: string;
    status: string;
    contributionRequired: number;
    notes: string;
    sectorRoles: Array<{ sectorId: number; roleId: number; isPrimary: boolean }>;
  }) => Promise<void>;
  onUpdateMember: (
    memberId: number,
    payload: {
      fullName: string;
      email: string;
      phone: string;
      location: string;
      status: string;
      contributionRequired: number;
      notes: string;
      sectorRoles: Array<{ sectorId: number; roleId: number; isPrimary: boolean }>;
    }
  ) => Promise<void>;
  onRecordPayment: (
    memberId: number,
    payload: {
      amount: number;
      paymentDate: string;
      paymentMethod: string;
      reference: string;
      notes: string;
    }
  ) => Promise<void>;
}

export function MembersView({
  members,
  sectors,
  roles,
  access,
  onCreateMember,
  onUpdateMember,
  onRecordPayment,
}: MembersViewProps) {
  const [search, setSearch] = useState('');
  const [sectorFilter, setSectorFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Member form state
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [location, setLocation] = useState('Central Hub');
  const [dateJoined, setDateJoined] = useState(todayIsoDate());
  const [memberStatus, setMemberStatus] = useState('active');
  const [contributionRequired, setContributionRequired] = useState('300');
  const [notes, setNotes] = useState('');
  const [assignments, setAssignments] = useState<Record<number, number>>({});

  // Payment form state
  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState(todayIsoDate());
  const [payMethod, setPayMethod] = useState('Mobile Money');
  const [payReference, setPayReference] = useState('');
  const [payNotes, setPayNotes] = useState('');

  const canWriteMembers = hasPermission(access, 'members.write');
  const canRecordPayments = hasPermission(access, 'members.payments');

  const selectedMember = useMemo(
    () => members.find((m) => m.id === selectedMemberId) ?? null,
    [members, selectedMemberId]
  );

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return members.filter((m) => {
      if (q) {
        const hay = `${m.fullName} ${m.email} ${m.memberCode} ${m.phone}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (
        sectorFilter !== 'all' &&
        !m.sectorRoles.some((sr) => String(sr.sectorId) === sectorFilter)
      ) {
        return false;
      }
      if (statusFilter !== 'all' && m.paymentStatus !== statusFilter) {
        return false;
      }
      return true;
    });
  }, [members, search, sectorFilter, statusFilter]);

  const openCreateModal = () => {
    setErrorMsg(null);
    setFullName('');
    setEmail('');
    setPhone('');
    setLocation('Central Hub');
    setDateJoined(todayIsoDate());
    setMemberStatus('active');
    setContributionRequired('250');
    setNotes('');
    const defaultRole =
      roles.find((r) => r.slug === 'member')?.id ?? roles[0]?.id ?? 1;
    const firstSector = sectors[0]?.id;
    setAssignments(firstSector ? { [firstSector]: defaultRole } : {});
    setFormMode('create');
  };

  const openEditModal = (m: MemberDto) => {
    setErrorMsg(null);
    setFullName(m.fullName);
    setEmail(m.email);
    setPhone(m.phone);
    setLocation(m.location);
    setDateJoined(m.dateJoined);
    setMemberStatus(m.status);
    setContributionRequired(String(m.contributionRequired));
    setNotes(m.notes);
    const map: Record<number, number> = {};
    for (const sr of m.sectorRoles) {
      map[sr.sectorId] = sr.roleId;
    }
    setAssignments(map);
    setSelectedMemberId(m.id);
    setFormMode('edit');
  };

  const toggleSectorAssignment = (sectorId: number) => {
    setAssignments((prev) => {
      const next = { ...prev };
      if (next[sectorId]) {
        delete next[sectorId];
      } else {
        const defaultRole =
          roles.find((r) => r.slug === 'member')?.id ?? roles[0]?.id ?? 1;
        next[sectorId] = defaultRole;
      }
      return next;
    });
  };

  const handleMemberSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const sectorRoles = Object.entries(assignments).map(([secId, roleId], idx) => ({
      sectorId: Number(secId),
      roleId: Number(roleId),
      isPrimary: idx === 0,
    }));

    if (sectorRoles.length === 0) {
      setErrorMsg('Assign at least one sector and role.');
      return;
    }

    setSubmitting(true);
    try {
      if (formMode === 'create') {
        await onCreateMember({
          fullName,
          email,
          phone,
          location,
          dateJoined,
          status: memberStatus,
          contributionRequired: Number(contributionRequired) || 0,
          notes,
          sectorRoles,
        });
      } else if (formMode === 'edit' && selectedMember) {
        await onUpdateMember(selectedMember.id, {
          fullName,
          email,
          phone,
          location,
          status: memberStatus,
          contributionRequired: Number(contributionRequired) || 0,
          notes,
          sectorRoles,
        });
      }
      setFormMode(null);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save member.');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMember) return;
    setErrorMsg(null);
    setSubmitting(true);
    try {
      await onRecordPayment(selectedMember.id, {
        amount: Number(payAmount),
        paymentDate: payDate,
        paymentMethod: payMethod,
        reference: payReference.trim(),
        notes: payNotes.trim(),
      });
      setPayAmount('');
      setPayReference('');
      setPayNotes('');
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Failed to record payment.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const renderPaymentStatusText = (status: string) => {
    if (status === 'paid') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          Paid
        </span>
      );
    }
    if (status === 'partially_paid') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          Partially Paid
        </span>
      );
    }
    return <span className="text-xs font-medium text-red-700">Unpaid</span>;
  };

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[260px]">
          <div className="relative flex-1 max-w-sm min-w-[200px]">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              aria-label="Search members"
              placeholder="Search name, code, email or phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
            />
          </div>

          <select
            aria-label="Filter by sector"
            value={sectorFilter}
            onChange={(e) => setSectorFilter(e.target.value)}
            className="px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-md text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
          >
            <option value="all">All Sectors</option>
            {sectors.map((s) => (
              <option key={s.id} value={String(s.id)}>
                {s.name}
              </option>
            ))}
          </select>

          <div
            className="flex items-center gap-1 p-1 bg-slate-100 rounded-md"
            role="group"
            aria-label="Filter by payment status"
          >
            {[
              { id: 'all', label: 'All' },
              { id: 'paid', label: 'Paid' },
              { id: 'partially_paid', label: 'Partial' },
              { id: 'unpaid', label: 'Unpaid' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`px-2.5 py-1 text-xs font-medium rounded-sm transition-colors whitespace-nowrap shrink-0 ${
                  statusFilter === tab.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {canWriteMembers && (
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            <UserPlus className="h-4 w-4" />
            <span>Register Member</span>
          </button>
        )}
      </div>

      {/* Member Directory Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                <th className="py-3 px-4 font-medium">Member</th>
                <th className="py-3 px-4 font-medium">Assigned Sectors & Roles</th>
                <th className="py-3 px-4 font-medium text-right">Required</th>
                <th className="py-3 px-4 font-medium text-right">Paid</th>
                <th className="py-3 px-4 font-medium text-right">Outstanding</th>
                <th className="py-3 px-4 font-medium">Payment Status</th>
                <th className="py-3 px-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredMembers.map((m) => (
                <tr key={m.id} className="hover:bg-slate-50/70">
                  <td className="py-3 px-4">
                    <div className="font-medium text-slate-900">{m.fullName}</div>
                    <div className="text-xs text-slate-500 font-mono">
                      {m.memberCode} · {m.email}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="space-y-0.5 text-xs text-slate-700">
                      {m.sectorRoles.map((sr) => (
                        <div key={sr.sectorId}>
                          <span className="font-medium text-slate-900">
                            {sr.sectorName}
                          </span>{' '}
                          <span className="text-slate-400">·</span>{' '}
                          <span className="text-slate-600">{sr.roleName}</span>
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                    {formatCurrency(m.contributionRequired)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-emerald-700 font-medium">
                    {formatCurrency(m.amountPaid)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-900">
                    {formatCurrency(m.outstandingBalance)}
                  </td>
                  <td className="py-3 px-4">
                    {renderPaymentStatusText(m.paymentStatus)}
                  </td>
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => {
                        setErrorMsg(null);
                        setSelectedMemberId(m.id);
                      }}
                      className="text-xs font-medium text-emerald-700 hover:text-emerald-800 mr-3"
                    >
                      History & Pay
                    </button>
                    {canWriteMembers && (
                      <button
                        type="button"
                        onClick={() => openEditModal(m)}
                        className="text-xs font-medium text-slate-600 hover:text-slate-900"
                      >
                        Edit
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {filteredMembers.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="py-10 px-4 text-center text-sm text-slate-500"
                  >
                    No members match your current search or filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Member Detail & Payment History Drawer */}
      {selectedMember && !formMode && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-slate-950/40"
          role="dialog"
          aria-modal="true"
          aria-label={`Member record for ${selectedMember.fullName}`}
        >
          <div className="w-full max-w-lg bg-white h-full overflow-y-auto border-l border-slate-200 p-6 space-y-6">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <p className="text-xs font-mono text-slate-500">
                  {selectedMember.memberCode} · Joined {selectedMember.dateJoined}
                </p>
                <h2 className="mt-1 text-lg font-bold text-slate-900">
                  {selectedMember.fullName}
                </h2>
                <p className="text-sm text-slate-600">
                  {selectedMember.email} · {selectedMember.phone}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedMemberId(null)}
                aria-label="Close member detail panel"
                className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3 border-b border-slate-100 pb-5">
              <div>
                <p className="text-xs text-slate-500">Required</p>
                <p className="mt-1 text-base font-mono tabular-nums font-semibold text-slate-900">
                  {formatCurrency(selectedMember.contributionRequired)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Paid</p>
                <p className="mt-1 text-base font-mono tabular-nums font-semibold text-emerald-700">
                  {formatCurrency(selectedMember.amountPaid)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Balance</p>
                <p className="mt-1 text-base font-mono tabular-nums font-semibold text-slate-900">
                  {formatCurrency(selectedMember.outstandingBalance)}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Multi-Sector Assignments
              </h3>
              <ul className="divide-y divide-slate-100 border border-slate-200 rounded-md">
                {selectedMember.sectorRoles.map((sr) => (
                  <li
                    key={sr.sectorId}
                    className="px-3.5 py-2.5 flex items-center justify-between text-sm"
                  >
                    <span className="font-medium text-slate-900">
                      {sr.sectorName}
                    </span>
                    <span className="text-xs text-slate-600">{sr.roleName}</span>
                  </li>
                ))}
              </ul>
            </div>

            {canRecordPayments && (
              <form
                onSubmit={handlePaymentSubmit}
                className="space-y-3 border-t border-slate-100 pt-5"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-emerald-700" />
                    <span>Record Contribution Payment</span>
                  </h3>
                  <span className="text-xs text-slate-500">
                    Status: {formatPaymentStatusLabel(selectedMember.paymentStatus)}
                  </span>
                </div>

                {errorMsg && (
                  <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                    {errorMsg}
                  </p>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="pay-amount"
                      className="block text-xs font-medium text-slate-700 mb-1"
                    >
                      Amount (USD)
                    </label>
                    <input
                      id="pay-amount"
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md font-mono tabular-nums"
                      placeholder="100.00"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="pay-date"
                      className="block text-xs font-medium text-slate-700 mb-1"
                    >
                      Payment Date
                    </label>
                    <input
                      id="pay-date"
                      type="date"
                      required
                      value={payDate}
                      onChange={(e) => setPayDate(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="pay-method"
                      className="block text-xs font-medium text-slate-700 mb-1"
                    >
                      Method
                    </label>
                    <select
                      id="pay-method"
                      value={payMethod}
                      onChange={(e) => setPayMethod(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md"
                    >
                      <option value="Mobile Money">Mobile Money</option>
                      <option value="Bank Transfer">Bank Transfer</option>
                      <option value="Cash Deposit">Cash Deposit</option>
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor="pay-ref"
                      className="block text-xs font-medium text-slate-700 mb-1"
                    >
                      Receipt Reference
                    </label>
                    <input
                      id="pay-ref"
                      type="text"
                      required
                      value={payReference}
                      onChange={(e) => setPayReference(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md font-mono"
                      placeholder="PAY-2026-881"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="pay-notes"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Notes
                  </label>
                  <input
                    id="pay-notes"
                    type="text"
                    value={payNotes}
                    onChange={(e) => setPayNotes(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md"
                    placeholder="Optional receipt notes"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-2 px-4 text-sm font-medium text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 rounded-md transition-colors"
                >
                  {submitting ? 'Recording...' : 'Save Payment & Post to Ledger'}
                </button>
              </form>
            )}

            <div className="space-y-3 border-t border-slate-100 pt-5">
              <h3 className="text-sm font-semibold text-slate-900">
                Payment History
              </h3>
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-md">
                {(selectedMember.payments ?? []).map((p) => (
                  <div
                    key={p.id}
                    className="px-3.5 py-2.5 flex items-center justify-between text-xs"
                  >
                    <div>
                      <p className="font-mono font-medium text-slate-900">
                        {p.reference} · {p.paymentMethod}
                      </p>
                      <p className="text-slate-500">
                        {p.paymentDate} · Recorded by {p.recordedByEmail}
                      </p>
                    </div>
                    <span className="font-mono tabular-nums font-semibold text-emerald-700">
                      {formatCurrency(p.amount)}
                    </span>
                  </div>
                ))}
                {(selectedMember.payments ?? []).length === 0 && (
                  <p className="px-3.5 py-4 text-xs text-slate-500">
                    No contribution installments recorded yet.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Register / Edit Member Modal */}
      {formMode && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={
            formMode === 'create' ? 'Register new member' : 'Edit member profile'
          }
        >
          <div className="bg-white border border-slate-200 rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  {formMode === 'create'
                    ? 'Register Organisation Member'
                    : `Update Member: ${fullName}`}
                </h2>
                <p className="text-xs text-slate-500">
                  Single profile linked across one or more sectors with per-sector roles
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFormMode(null)}
                aria-label="Close member form"
                className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {errorMsg && (
              <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                {errorMsg}
              </p>
            )}

            <form onSubmit={handleMemberSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="mem-name"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Full Name
                  </label>
                  <input
                    id="mem-name"
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md"
                    placeholder="e.g. Samuel Kato"
                  />
                </div>
                <div>
                  <label
                    htmlFor="mem-email"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Email Address (Unique Profile Key)
                  </label>
                  <input
                    id="mem-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md"
                    placeholder="samuel.kato@genzagririse.org"
                  />
                </div>
                <div>
                  <label
                    htmlFor="mem-phone"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Phone Contact
                  </label>
                  <input
                    id="mem-phone"
                    type="text"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md"
                    placeholder="+256 770 000 000"
                  />
                </div>
                <div>
                  <label
                    htmlFor="mem-location"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Hub / Location
                  </label>
                  <input
                    id="mem-location"
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md"
                  />
                </div>
                <div>
                  <label
                    htmlFor="mem-joined"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Date Joined
                  </label>
                  <input
                    id="mem-joined"
                    type="date"
                    value={dateJoined}
                    disabled={formMode === 'edit'}
                    onChange={(e) => setDateJoined(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md font-mono"
                  />
                </div>
                <div>
                  <label
                    htmlFor="mem-contrib"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Required Contribution (USD)
                  </label>
                  <input
                    id="mem-contrib"
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={contributionRequired}
                    onChange={(e) => setContributionRequired(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md font-mono tabular-nums"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="mem-status"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Membership Status
                </label>
                <select
                  id="mem-status"
                  value={memberStatus}
                  onChange={(e) => setMemberStatus(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="suspended">Suspended</option>
                </select>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-700">
                  Sector Assignments & Roles (select one or multiple sectors)
                </p>
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-md">
                  {sectors.map((sec) => {
                    const assignedRoleId = assignments[sec.id];
                    const isChecked = assignedRoleId !== undefined;
                    return (
                      <div
                        key={sec.id}
                        className="px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-3"
                      >
                        <label className="flex items-center gap-2.5 text-sm font-medium text-slate-800 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleSectorAssignment(sec.id)}
                            className="h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"
                          />
                          <span>{sec.name}</span>
                        </label>
                        {isChecked && (
                          <select
                            aria-label={`Role for ${sec.name}`}
                            value={assignedRoleId}
                            onChange={(e) =>
                              setAssignments((prev) => ({
                                ...prev,
                                [sec.id]: Number(e.target.value),
                              }))
                            }
                            className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-md bg-slate-50"
                          >
                            {roles.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <label
                  htmlFor="mem-notes"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Administrative Notes
                </label>
                <textarea
                  id="mem-notes"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setFormMode(null)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 rounded-md"
                >
                  <Plus className="h-4 w-4" />
                  <span>
                    {submitting
                      ? 'Saving...'
                      : formMode === 'create'
                      ? 'Register Member'
                      : 'Save Changes'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
