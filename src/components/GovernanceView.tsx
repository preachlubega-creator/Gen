import { useState } from 'react';
import { Plus, ShieldCheck } from 'lucide-react';
import type {
  AuditLogDto,
  PermissionDto,
  RoleDto,
  SectorDto,
  UserAccessContext,
} from '../domain/types.ts';
import { hasPermission } from '../domain/calculations.ts';

interface GovernanceViewProps {
  roles: RoleDto[];
  permissions: PermissionDto[];
  auditLogs: AuditLogDto[];
  sectors: SectorDto[];
  access: UserAccessContext;
  onUpdateRolePermissions: (
    roleId: number,
    permissionKeys: string[]
  ) => Promise<void>;
  onCreateSector: (payload: {
    name: string;
    description: string;
    focusArea: string;
  }) => Promise<void>;
}

export function GovernanceView({
  roles,
  permissions,
  auditLogs,
  sectors,
  access,
  onUpdateRolePermissions,
  onCreateSector,
}: GovernanceViewProps) {
  const [activeTab, setActiveTab] = useState<'rbac' | 'audit' | 'sectors'>(
    hasPermission(access, 'rbac.manage') ? 'rbac' : 'audit'
  );
  const [savingRoleId, setSavingRoleId] = useState<number | null>(null);
  const [auditEntityFilter, setAuditEntityFilter] = useState('all');
  const [sectorName, setSectorName] = useState('');
  const [sectorDesc, setSectorDesc] = useState('');
  const [sectorFocus, setSectorFocus] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  const canManageRbac = hasPermission(access, 'rbac.manage');
  const canViewAudit = hasPermission(access, 'audit.view');

  const togglePermission = async (role: RoleDto, permKey: string) => {
    if (!canManageRbac) return;
    setFeedback(null);
    const hasIt = role.permissionKeys.includes(permKey);
    const nextKeys = hasIt
      ? role.permissionKeys.filter((k) => k !== permKey)
      : [...role.permissionKeys, permKey];

    setSavingRoleId(role.id);
    try {
      await onUpdateRolePermissions(role.id, nextKeys);
      setFeedback(`Updated permissions for ${role.name}.`);
    } catch (err: unknown) {
      setFeedback(
        err instanceof Error ? err.message : 'Unable to update permissions.'
      );
    } finally {
      setSavingRoleId(null);
    }
  };

  const handleAddSector = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      await onCreateSector({
        name: sectorName.trim(),
        description: sectorDesc.trim(),
        focusArea: sectorFocus.trim(),
      });
      setSectorName('');
      setSectorDesc('');
      setSectorFocus('');
      setFeedback('New sector registered cleanly.');
    } catch (err: unknown) {
      setFeedback(err instanceof Error ? err.message : 'Failed to create sector.');
    }
  };

  const filteredLogs = auditLogs.filter((l) =>
    auditEntityFilter === 'all' ? true : l.entityType === auditEntityFilter
  );

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md">
          <button
            type="button"
            onClick={() => setActiveTab('rbac')}
            className={`px-3 py-1.5 text-xs font-medium rounded-sm whitespace-nowrap shrink-0 ${
              activeTab === 'rbac'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Role & Permission Matrix
          </button>
          {canViewAudit && (
            <button
              type="button"
              onClick={() => setActiveTab('audit')}
              className={`px-3 py-1.5 text-xs font-medium rounded-sm whitespace-nowrap shrink-0 ${
                activeTab === 'audit'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Audit Trail ({auditLogs.length})
            </button>
          )}
          {canManageRbac && (
            <button
              type="button"
              onClick={() => setActiveTab('sectors')}
              className={`px-3 py-1.5 text-xs font-medium rounded-sm whitespace-nowrap shrink-0 ${
                activeTab === 'sectors'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Sector Registry ({sectors.length})
            </button>
          )}
        </div>

        {feedback && (
          <p className="text-xs font-medium text-emerald-700">{feedback}</p>
        )}
      </div>

      {activeTab === 'rbac' && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-700" />
              <h2 className="text-base font-semibold text-slate-900">
                Configurable Backend Role-Based Access Control
              </h2>
            </div>
            <span className="text-xs text-slate-500">
              {canManageRbac
                ? 'Click any checkbox to update server-enforced permissions'
                : 'Read-only permission overview'}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                  <th className="py-3 px-4 font-medium">Permission</th>
                  <th className="py-3 px-4 font-medium">Module</th>
                  {roles.map((r) => (
                    <th key={r.id} className="py-3 px-3 font-medium text-center">
                      {r.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {permissions.map((perm) => (
                  <tr key={perm.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900">{perm.label}</div>
                      <div className="font-mono text-[11px] text-slate-400">
                        {perm.key}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-600">{perm.module}</td>
                    {roles.map((r) => {
                      const checked = r.permissionKeys.includes(perm.key);
                      const locked =
                        r.slug === 'founder' &&
                        (perm.key === 'rbac.manage' || perm.key === 'audit.view');
                      return (
                        <td key={r.id} className="py-3 px-3 text-center">
                          <input
                            type="checkbox"
                            aria-label={`${perm.label} for ${r.name}`}
                            checked={checked}
                            disabled={
                              !canManageRbac ||
                              locked ||
                              savingRoleId === r.id
                            }
                            onChange={() => togglePermission(r, perm.key)}
                            className="h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600 disabled:opacity-50"
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'audit' && canViewAudit && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden space-y-0">
          <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-slate-900">
              Immutable Administrative & Financial Audit Log
            </h2>
            <select
              aria-label="Filter audit trail by entity type"
              value={auditEntityFilter}
              onChange={(e) => setAuditEntityFilter(e.target.value)}
              className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md"
            >
              <option value="all">All Entities</option>
              <option value="financial_transaction">Financial Transactions</option>
              <option value="member">Members</option>
              <option value="member_payment">Member Payments</option>
              <option value="project">Projects</option>
              <option value="role">RBAC Roles</option>
              <option value="report">Reports</option>
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                  <th className="py-3 px-4 font-medium">Timestamp</th>
                  <th className="py-3 px-4 font-medium">Actor</th>
                  <th className="py-3 px-4 font-medium">Action</th>
                  <th className="py-3 px-4 font-medium">Summary</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-500 whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900">{log.actorEmail}</div>
                      <div className="text-slate-500">{log.actorRole}</div>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-700 whitespace-nowrap">
                      {log.action}
                    </td>
                    <td className="py-3 px-4 text-slate-800">{log.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'sectors' && canManageRbac && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-3">
            <h2 className="text-base font-semibold text-slate-900">
              Active Organisational Sectors
            </h2>
            <div className="divide-y divide-slate-100">
              {sectors.map((s) => (
                <div key={s.id} className="py-3">
                  <p className="text-sm font-semibold text-slate-900">{s.name}</p>
                  <p className="text-xs text-slate-600 mt-0.5">{s.description}</p>
                  <p className="text-xs text-slate-400 mt-0.5">Focus: {s.focusArea}</p>
                </div>
              ))}
            </div>
          </div>

          <form
            onSubmit={handleAddSector}
            className="bg-white border border-slate-200 rounded-lg p-5 space-y-4 h-fit"
          >
            <h2 className="text-base font-semibold text-slate-900">
              Register Additional Sector
            </h2>
            <p className="text-xs text-slate-500">
              Expand the organisation with new operational divisions as Gen Z AgriRise scales.
            </p>
            <div>
              <label htmlFor="sec-name" className="block text-xs font-medium text-slate-700 mb-1">
                Sector Name
              </label>
              <input
                id="sec-name"
                type="text"
                required
                value={sectorName}
                onChange={(e) => setSectorName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md"
                placeholder="e.g. Aquaculture"
              />
            </div>
            <div>
              <label htmlFor="sec-desc" className="block text-xs font-medium text-slate-700 mb-1">
                Description
              </label>
              <textarea
                id="sec-desc"
                rows={2}
                required
                value={sectorDesc}
                onChange={(e) => setSectorDesc(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md"
              />
            </div>
            <div>
              <label htmlFor="sec-focus" className="block text-xs font-medium text-slate-700 mb-1">
                Operational Focus
              </label>
              <input
                id="sec-focus"
                type="text"
                value={sectorFocus}
                onChange={(e) => setSectorFocus(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md"
                placeholder="e.g. Tilapia ponds, fingerling hatchery & feed"
              />
            </div>
            <button
              type="submit"
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-md"
            >
              <Plus className="h-4 w-4" />
              <span>Add Sector</span>
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
