import { useState } from 'react';
import { FolderPlus, TrendingUp, X } from 'lucide-react';
import type {
  MemberDto,
  ProjectDto,
  SectorDto,
  UserAccessContext,
} from '../domain/types.ts';
import { hasPermission } from '../domain/calculations.ts';
import { formatCurrency, todayIsoDate } from '../lib/format.ts';

interface ProjectsViewProps {
  projects: ProjectDto[];
  sectors: SectorDto[];
  members: MemberDto[];
  access: UserAccessContext;
  onCreateProject: (payload: {
    sectorId: number;
    managerMemberId: number | null;
    name: string;
    description: string;
    budget: number;
    status: string;
    startDate: string;
    targetEndDate: string;
  }) => Promise<void>;
  onLogProgress: (
    projectId: number,
    payload: { milestonePct: number; summary: string; logDate: string }
  ) => Promise<void>;
}

export function ProjectsView({
  projects,
  sectors,
  members,
  access,
  onCreateProject,
  onLogProgress,
}: ProjectsViewProps) {
  const [sectorFilter, setSectorFilter] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [progressTarget, setProgressTarget] = useState<ProjectDto | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Create form
  const [sectorId, setSectorId] = useState(String(sectors[0]?.id ?? 1));
  const [managerMemberId, setManagerMemberId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [budget, setBudget] = useState('5000');
  const [status, setStatus] = useState('active');
  const [startDate, setStartDate] = useState(todayIsoDate());
  const [targetEndDate, setTargetEndDate] = useState('');

  // Progress log form
  const [milestonePct, setMilestonePct] = useState('50');
  const [summary, setSummary] = useState('');
  const [logDate, setLogDate] = useState(todayIsoDate());

  const canManageAny = hasPermission(access, 'projects.manage');

  const visibleProjects = projects.filter((p) =>
    sectorFilter === 'all' ? true : String(p.sectorId) === sectorFilter
  );

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);
    try {
      await onCreateProject({
        sectorId: Number(sectorId),
        managerMemberId: managerMemberId ? Number(managerMemberId) : null,
        name: name.trim(),
        description: description.trim(),
        budget: Number(budget) || 0,
        status,
        startDate,
        targetEndDate,
      });
      setShowCreate(false);
      setName('');
      setDescription('');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to create project.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogProgress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!progressTarget) return;
    setErrorMsg(null);
    setSubmitting(true);
    try {
      await onLogProgress(progressTarget.id, {
        milestonePct: Number(milestonePct),
        summary: summary.trim(),
        logDate,
      });
      setProgressTarget(null);
      setSummary('');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to log progress.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md">
            <button
              type="button"
              onClick={() => setSectorFilter('all')}
              className={`px-3 py-1.5 text-xs font-medium rounded-sm whitespace-nowrap shrink-0 ${
                sectorFilter === 'all'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Sectors
            </button>
            {sectors.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSectorFilter(String(s.id))}
                className={`px-3 py-1.5 text-xs font-medium rounded-sm whitespace-nowrap shrink-0 ${
                  sectorFilter === String(s.id)
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>

        {canManageAny && (
          <button
            type="button"
            onClick={() => {
              setErrorMsg(null);
              setShowCreate(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-md whitespace-nowrap shrink-0"
          >
            <FolderPlus className="h-4 w-4" />
            <span>New Project</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {visibleProjects.map((project) => {
          const canManageThis = hasPermission(
            access,
            'projects.manage',
            project.sectorId
          );
          return (
            <article
              key={project.id}
              className="bg-white border border-slate-200 rounded-lg p-6 space-y-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs text-slate-500">
                    {project.sectorName} · <span className="font-mono">{project.code}</span> ·{' '}
                    <span className="capitalize">{project.status}</span>
                  </p>
                  <h3 className="mt-1 text-base font-bold text-slate-900">
                    {project.name}
                  </h3>
                </div>
                {canManageThis && (
                  <button
                    type="button"
                    onClick={() => {
                      setErrorMsg(null);
                      setMilestonePct(String(project.latestProgressPct));
                      setLogDate(todayIsoDate());
                      setSummary('');
                      setProgressTarget(project);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-md whitespace-nowrap shrink-0"
                  >
                    <TrendingUp className="h-3.5 w-3.5" />
                    <span>Log Progress</span>
                  </button>
                )}
              </div>

              <p className="text-sm text-slate-600">{project.description}</p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-100 text-xs">
                <div>
                  <span className="text-slate-500">Budget</span>
                  <p className="mt-0.5 font-mono tabular-nums font-semibold text-slate-900">
                    {formatCurrency(project.budget)}
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Invested</span>
                  <p className="mt-0.5 font-mono tabular-nums font-semibold text-slate-900">
                    {formatCurrency(project.investmentReceived)}
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Expenditure</span>
                  <p className="mt-0.5 font-mono tabular-nums font-semibold text-amber-700">
                    {formatCurrency(project.expenditure)}
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Revenue</span>
                  <p className="mt-0.5 font-mono tabular-nums font-semibold text-emerald-700">
                    {formatCurrency(project.revenue)}
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">
                    Manager: {project.managerName ?? 'Unassigned'}
                  </span>
                  <span className="font-mono tabular-nums font-semibold text-slate-900">
                    {project.latestProgressPct}%
                  </span>
                </div>
                <div className="h-2 w-full bg-slate-100 rounded-sm overflow-hidden">
                  <div
                    className="h-full bg-emerald-600"
                    style={{ width: `${project.latestProgressPct}%` }}
                  />
                </div>
              </div>

              {project.progressLogs.length > 0 && (
                <div className="pt-2 border-t border-slate-100 space-y-2">
                  <p className="text-xs font-semibold text-slate-500">
                    Latest Progress Updates
                  </p>
                  {project.progressLogs.slice(0, 2).map((log) => (
                    <div key={log.id} className="text-xs text-slate-600">
                      <span className="font-mono text-slate-500">{log.logDate}</span> ·{' '}
                      <span className="font-mono font-semibold text-slate-800">
                        {log.milestonePct}%
                      </span>{' '}
                      — {log.summary}
                    </div>
                  ))}
                </div>
              )}
            </article>
          );
        })}
      </div>

      {/* Create Project Modal */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Create sector project"
        >
          <div className="bg-white border border-slate-200 rounded-lg w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-base font-bold text-slate-900">
                Create Sector Project
              </h2>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                aria-label="Close project form"
                className="p-1.5 text-slate-400 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {errorMsg && (
              <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                {errorMsg}
              </p>
            )}

            <form onSubmit={handleCreate} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="prj-sec" className="block text-xs font-medium text-slate-700 mb-1">
                    Sector
                  </label>
                  <select
                    id="prj-sec"
                    value={sectorId}
                    onChange={(e) => setSectorId(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md"
                  >
                    {sectors.map((s) => (
                      <option key={s.id} value={String(s.id)}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="prj-mgr" className="block text-xs font-medium text-slate-700 mb-1">
                    Responsible Manager
                  </label>
                  <select
                    id="prj-mgr"
                    value={managerMemberId}
                    onChange={(e) => setManagerMemberId(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md"
                  >
                    <option value="">Unassigned</option>
                    {members.map((m) => (
                      <option key={m.id} value={String(m.id)}>
                        {m.fullName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="prj-name" className="block text-xs font-medium text-slate-700 mb-1">
                  Project Name
                </label>
                <input
                  id="prj-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md"
                />
              </div>

              <div>
                <label htmlFor="prj-desc" className="block text-xs font-medium text-slate-700 mb-1">
                  Description
                </label>
                <textarea
                  id="prj-desc"
                  rows={2}
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label htmlFor="prj-budget" className="block text-xs font-medium text-slate-700 mb-1">
                    Budget ($)
                  </label>
                  <input
                    id="prj-budget"
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md font-mono"
                  />
                </div>
                <div>
                  <label htmlFor="prj-status" className="block text-xs font-medium text-slate-700 mb-1">
                    Status
                  </label>
                  <select
                    id="prj-status"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md"
                  >
                    <option value="planned">Planned</option>
                    <option value="active">Active</option>
                    <option value="paused">Paused</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="prj-start" className="block text-xs font-medium text-slate-700 mb-1">
                    Start Date
                  </label>
                  <input
                    id="prj-start"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-md">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="px-4 py-2 text-sm font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-md">
                  {submitting ? 'Creating...' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Progress Log Modal */}
      {progressTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Log progress for ${progressTarget.name}`}
        >
          <div className="bg-white border border-slate-200 rounded-lg w-full max-w-md p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-900">
              Update Progress: {progressTarget.name}
            </h2>
            {errorMsg && (
              <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                {errorMsg}
              </p>
            )}
            <form onSubmit={handleLogProgress} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="prog-pct" className="block text-xs font-medium text-slate-700 mb-1">
                    Completion (%)
                  </label>
                  <input
                    id="prog-pct"
                    type="number"
                    min="0"
                    max="100"
                    required
                    value={milestonePct}
                    onChange={(e) => setMilestonePct(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md font-mono"
                  />
                </div>
                <div>
                  <label htmlFor="prog-date" className="block text-xs font-medium text-slate-700 mb-1">
                    Log Date
                  </label>
                  <input
                    id="prog-date"
                    type="date"
                    required
                    value={logDate}
                    onChange={(e) => setLogDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md font-mono"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="prog-sum" className="block text-xs font-medium text-slate-700 mb-1">
                  Milestone Summary
                </label>
                <textarea
                  id="prog-sum"
                  rows={3}
                  required
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setProgressTarget(null)} className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-md">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="px-4 py-2 text-sm font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-md">
                  {submitting ? 'Saving...' : 'Save Milestone'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
