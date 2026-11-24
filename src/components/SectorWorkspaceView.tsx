import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import type {
  MemberDto,
  ProjectDto,
  SectorDto,
  SectorFinanceSummary,
  UserAccessContext,
} from '../domain/types.ts';
import { hasPermission } from '../domain/calculations.ts';
import { formatCurrency, formatNumber, todayIsoDate } from '../lib/format.ts';

export interface AgRecord {
  id: number;
  cropName: string;
  plotName: string;
  plantingDate: string;
  harvestDate: string;
  stage: string;
  inputsUsed: string;
  inputCost: number;
  expectedYieldKg: number;
  actualYieldKg: number;
  notes: string;
}

export interface PiggeryRecord {
  id: number;
  batchCode: string;
  category: string;
  headCount: number;
  birthsCount: number;
  purchasesCount: number;
  salesCount: number;
  feedPlan: string;
  feedCost: number;
  operatingCost: number;
  salesRevenue: number;
  healthStatus: string;
  recordDate: string;
  notes: string;
}

export interface PoultryRecord {
  id: number;
  flockCode: string;
  birdType: string;
  birdCount: number;
  mortalityCount: number;
  eggsCollected: number;
  feedUsedKg: number;
  feedCost: number;
  operatingCost: number;
  salesRevenue: number;
  recordDate: string;
  notes: string;
}

export interface VfRecord {
  id: number;
  systemName: string;
  systemType: string;
  cropVariety: string;
  cycleNumber: number;
  cycleStage: string;
  nutrientPh: number;
  ecLevel: number;
  inputsNote: string;
  operatingCost: number;
  yieldKg: number;
  recordDate: string;
}

interface SectorWorkspaceViewProps {
  sector: SectorDto;
  finance?: SectorFinanceSummary;
  members: MemberDto[];
  projects: ProjectDto[];
  agRecords: AgRecord[];
  piggeryRecords: PiggeryRecord[];
  poultryRecords: PoultryRecord[];
  vfRecords: VfRecord[];
  access: UserAccessContext;
  onLogOperation: (
    sectorSlug: string,
    payload: Record<string, unknown>
  ) => Promise<void>;
}

export function SectorWorkspaceView({
  sector,
  finance,
  members,
  projects,
  agRecords,
  piggeryRecords,
  poultryRecords,
  vfRecords,
  access,
  onLogOperation,
}: SectorWorkspaceViewProps) {
  const [showLogModal, setShowLogModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [formState, setFormState] = useState<Record<string, string>>({});

  const sectorMembers = members.filter((m) =>
    m.sectorRoles.some((sr) => sr.sectorId === sector.id)
  );
  const sectorProjects = projects.filter((p) => p.sectorId === sector.id);
  const canWriteOps = hasPermission(access, 'operations.write', sector.id);

  const allocated = finance?.allocated ?? 0;
  const totalSpend =
    (finance?.actualExpenditure ?? 0) + (finance?.projectInvestment ?? 0);
  const revenue = finance?.revenue ?? 0;
  const remaining = finance?.remainingAllocation ?? 0;

  const openModal = () => {
    setErrorMsg(null);
    const today = todayIsoDate();
    if (sector.slug === 'agriculture') {
      setFormState({
        cropName: '',
        plotName: '',
        plantingDate: today,
        harvestDate: '',
        stage: 'planted',
        inputsUsed: '',
        inputCost: '0',
        expectedYieldKg: '0',
        actualYieldKg: '0',
        notes: '',
      });
    } else if (sector.slug === 'piggery') {
      setFormState({
        batchCode: `PG-${today.slice(2, 7).replace('-', '')}`,
        category: 'growers',
        headCount: '12',
        birthsCount: '0',
        purchasesCount: '0',
        salesCount: '0',
        feedPlan: '',
        feedCost: '0',
        operatingCost: '0',
        salesRevenue: '0',
        healthStatus: 'healthy',
        recordDate: today,
        notes: '',
      });
    } else if (sector.slug === 'poultry') {
      setFormState({
        flockCode: `FLK-${today.slice(2, 7).replace('-', '')}`,
        birdType: 'layers',
        birdCount: '500',
        mortalityCount: '0',
        eggsCollected: '0',
        feedUsedKg: '0',
        feedCost: '0',
        operatingCost: '0',
        salesRevenue: '0',
        recordDate: today,
        notes: '',
      });
    } else {
      setFormState({
        systemName: '',
        systemType: 'NFT Hydroponics',
        cropVariety: '',
        cycleNumber: '1',
        cycleStage: 'vegetative',
        nutrientPh: '6.0',
        ecLevel: '1.8',
        inputsNote: '',
        operatingCost: '0',
        yieldKg: '0',
        recordDate: today,
      });
    }
    setShowLogModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);
    try {
      await onLogOperation(sector.slug, formState);
      setShowLogModal(false);
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Unable to save operational record.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const setField = (key: string, val: string) =>
    setFormState((prev) => ({ ...prev, [key]: val }));

  // Sector-specific headline metrics
  const renderSectorKpis = () => {
    if (sector.slug === 'agriculture') {
      const totalExpected = agRecords.reduce((s, r) => s + r.expectedYieldKg, 0);
      const totalActual = agRecords.reduce((s, r) => s + r.actualYieldKg, 0);
      const inputSpend = agRecords.reduce((s, r) => s + r.inputCost, 0);
      return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="Active Crop Blocks" value={String(agRecords.length)} sub={`${sectorMembers.length} assigned members`} />
          <KpiCard label="Actual Harvest Yield" value={`${formatNumber(totalActual)} kg`} sub={`Expected ${formatNumber(totalExpected)} kg`} />
          <KpiCard label="Crop Input Costs" value={formatCurrency(inputSpend)} sub={`Allocated ${formatCurrency(allocated)}`} />
          <KpiCard label="Sector Revenue" value={formatCurrency(revenue)} sub={`Remaining alloc ${formatCurrency(remaining)}`} accent />
        </div>
      );
    }
    if (sector.slug === 'piggery') {
      const totalHead = piggeryRecords.reduce((s, r) => s + r.headCount, 0);
      const totalBirths = piggeryRecords.reduce((s, r) => s + r.birthsCount, 0);
      const totalSold = piggeryRecords.reduce((s, r) => s + r.salesCount, 0);
      const feedAndOps = piggeryRecords.reduce((s, r) => s + r.feedCost + r.operatingCost, 0);
      return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="Current Herd Count" value={`${totalHead} head`} sub={`${totalBirths} births · ${totalSold} sold`} />
          <KpiCard label="Feed & Operating Spend" value={formatCurrency(feedAndOps)} sub={`Ledger spend ${formatCurrency(totalSpend)}`} />
          <KpiCard label="Allocated Budget" value={formatCurrency(allocated)} sub={`Remaining ${formatCurrency(remaining)}`} />
          <KpiCard label="Herd Sales Revenue" value={formatCurrency(revenue)} sub={`${sectorMembers.length} team members`} accent />
        </div>
      );
    }
    if (sector.slug === 'poultry') {
      const totalBirds = poultryRecords.reduce((s, r) => s + r.birdCount, 0);
      const totalEggs = poultryRecords.reduce((s, r) => s + r.eggsCollected, 0);
      const totalMortality = poultryRecords.reduce((s, r) => s + r.mortalityCount, 0);
      const feedKg = poultryRecords.reduce((s, r) => s + r.feedUsedKg, 0);
      return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="Active Bird Count" value={formatNumber(totalBirds)} sub={`Mortality recorded: ${totalMortality}`} />
          <KpiCard label="Total Eggs Collected" value={formatNumber(totalEggs)} sub={`Feed used: ${formatNumber(feedKg)} kg`} />
          <KpiCard label="Allocated vs. Spend" value={formatCurrency(allocated)} sub={`Actual spend ${formatCurrency(totalSpend)}`} />
          <KpiCard label="Poultry Revenue" value={formatCurrency(revenue)} sub={`Remaining alloc ${formatCurrency(remaining)}`} accent />
        </div>
      );
    }
    const totalYield = vfRecords.reduce((s, r) => s + r.yieldKg, 0);
    const avgPh =
      vfRecords.length > 0
        ? (
            vfRecords.reduce((s, r) => s + r.nutrientPh, 0) / vfRecords.length
          ).toFixed(2)
        : '—';
    const avgEc =
      vfRecords.length > 0
        ? (
            vfRecords.reduce((s, r) => s + r.ecLevel, 0) / vfRecords.length
          ).toFixed(2)
        : '—';
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Active Hydroponic Cycles" value={String(vfRecords.length)} sub={`Avg pH ${avgPh} · EC ${avgEc} mS/cm`} />
        <KpiCard label="Harvested Yield" value={`${formatNumber(totalYield)} kg`} sub={`${sectorMembers.length} specialists`} />
        <KpiCard label="Allocated vs. Spend" value={formatCurrency(allocated)} sub={`Actual spend ${formatCurrency(totalSpend)}`} />
        <KpiCard label="Sector Revenue" value={formatCurrency(revenue)} sub={`Remaining alloc ${formatCurrency(remaining)}`} accent />
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Sector Header */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            {sector.name} Workspace
          </h2>
          <p className="text-sm text-slate-600 mt-0.5">
            {sector.description} · Focus: {sector.focusArea}
          </p>
        </div>
        {canWriteOps && (
          <button
            type="button"
            onClick={openModal}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-md whitespace-nowrap shrink-0"
          >
            <Plus className="h-4 w-4" />
            <span>
              {sector.slug === 'agriculture'
                ? 'Log Crop Cycle'
                : sector.slug === 'piggery'
                ? 'Log Piggery Batch'
                : sector.slug === 'poultry'
                ? 'Log Poultry Flock'
                : 'Log Growing Cycle'}
            </span>
          </button>
        )}
      </div>

      {/* Tailored KPI Strip */}
      {renderSectorKpis()}

      {/* Tailored Operational Table */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-900">
            {sector.slug === 'agriculture'
              ? 'Crop Plots, Inputs & Harvest Tracking'
              : sector.slug === 'piggery'
              ? 'Livestock Batches, Breeding & Herd Economics'
              : sector.slug === 'poultry'
              ? 'Flock Health, Egg Output & Feed Tracking'
              : 'Hydroponic Growing Systems, Calibration & Yields'}
          </h3>
        </div>

        <div className="overflow-x-auto">
          {sector.slug === 'agriculture' && (
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                  <th className="py-3 px-4 font-medium">Crop & Plot</th>
                  <th className="py-3 px-4 font-medium">Stage & Dates</th>
                  <th className="py-3 px-4 font-medium">Inputs Applied</th>
                  <th className="py-3 px-4 font-medium text-right">Input Cost</th>
                  <th className="py-3 px-4 font-medium text-right">Expected (kg)</th>
                  <th className="py-3 px-4 font-medium text-right">Actual (kg)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {agRecords.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900">{r.cropName}</div>
                      <div className="text-xs text-slate-500">{r.plotName}</div>
                    </td>
                    <td className="py-3 px-4 text-xs">
                      <div className="font-medium capitalize text-slate-800">{r.stage}</div>
                      <div className="font-mono text-slate-500">
                        Planted {r.plantingDate}
                        {r.harvestDate ? ` · Harvest ${r.harvestDate}` : ''}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600 max-w-xs">{r.inputsUsed || '—'}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-900">
                      {formatCurrency(r.inputCost)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-600">
                      {formatNumber(r.expectedYieldKg)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-emerald-700">
                      {formatNumber(r.actualYieldKg)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {sector.slug === 'piggery' && (
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                  <th className="py-3 px-4 font-medium">Batch & Category</th>
                  <th className="py-3 px-4 font-medium text-right">Head Count</th>
                  <th className="py-3 px-4 font-medium text-right">Births / Sales</th>
                  <th className="py-3 px-4 font-medium">Feed Plan & Health</th>
                  <th className="py-3 px-4 font-medium text-right">Feed + Ops Cost</th>
                  <th className="py-3 px-4 font-medium text-right">Sales Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {piggeryRecords.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4">
                      <div className="font-mono font-semibold text-slate-900">{r.batchCode}</div>
                      <div className="text-xs capitalize text-slate-500">
                        {r.category} · {r.recordDate}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-900">
                      {r.headCount}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-xs text-slate-700">
                      +{r.birthsCount} births · {r.salesCount} sold
                    </td>
                    <td className="py-3 px-4 text-xs">
                      <div className="text-slate-800">{r.feedPlan || 'Standard ration'}</div>
                      <div className="capitalize text-emerald-700 font-medium">{r.healthStatus}</div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-amber-700">
                      {formatCurrency(r.feedCost + r.operatingCost)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-emerald-700">
                      {formatCurrency(r.salesRevenue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {sector.slug === 'poultry' && (
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                  <th className="py-3 px-4 font-medium">Flock & Type</th>
                  <th className="py-3 px-4 font-medium text-right">Birds</th>
                  <th className="py-3 px-4 font-medium text-right">Mortality</th>
                  <th className="py-3 px-4 font-medium text-right">Eggs Collected</th>
                  <th className="py-3 px-4 font-medium text-right">Feed (kg) / Cost</th>
                  <th className="py-3 px-4 font-medium text-right">Sales Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {poultryRecords.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4">
                      <div className="font-mono font-semibold text-slate-900">{r.flockCode}</div>
                      <div className="text-xs capitalize text-slate-500">
                        {r.birdType} · {r.recordDate}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-900">
                      {formatNumber(r.birdCount)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-600">
                      {r.mortalityCount}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-900 font-medium">
                      {formatNumber(r.eggsCollected)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-xs text-amber-700">
                      {formatNumber(r.feedUsedKg)} kg · {formatCurrency(r.feedCost + r.operatingCost)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-emerald-700">
                      {formatCurrency(r.salesRevenue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {sector.slug !== 'agriculture' &&
            sector.slug !== 'piggery' &&
            sector.slug !== 'poultry' && (
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                    <th className="py-3 px-4 font-medium">System & Crop</th>
                    <th className="py-3 px-4 font-medium">Cycle & Stage</th>
                    <th className="py-3 px-4 font-medium text-right">pH / EC</th>
                    <th className="py-3 px-4 font-medium">Inputs</th>
                    <th className="py-3 px-4 font-medium text-right">Operating Cost</th>
                    <th className="py-3 px-4 font-medium text-right">Yield (kg)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {vfRecords.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900">{r.systemName}</div>
                        <div className="text-xs text-slate-500">
                          {r.systemType} · {r.cropVariety}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-xs">
                        <div className="font-mono text-slate-900">Cycle #{r.cycleNumber}</div>
                        <div className="capitalize text-slate-500">
                          {r.cycleStage.replace('_', ' ')} · {r.recordDate}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-xs text-slate-800">
                        pH {r.nutrientPh} · {r.ecLevel} mS
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600 max-w-xs">{r.inputsNote || '—'}</td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-amber-700">
                        {formatCurrency(r.operatingCost)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-emerald-700">
                        {formatNumber(r.yieldKg)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>
      </section>

      {/* Sector Team & Sector Projects Split */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-3">
          <h3 className="text-sm font-semibold text-slate-900">
            Assigned {sector.name} Members ({sectorMembers.length})
          </h3>
          <div className="divide-y divide-slate-100">
            {sectorMembers.map((m) => {
              const roleInfo = m.sectorRoles.find((sr) => sr.sectorId === sector.id);
              return (
                <div key={m.id} className="py-2.5 flex items-center justify-between text-sm">
                  <div>
                    <p className="font-medium text-slate-900">{m.fullName}</p>
                    <p className="text-xs text-slate-500">
                      {m.memberCode} · {m.phone}
                    </p>
                  </div>
                  <span className="text-xs font-medium text-slate-700">
                    {roleInfo?.roleName}
                  </span>
                </div>
              );
            })}
            {sectorMembers.length === 0 && (
              <p className="py-4 text-xs text-slate-500">
                No members assigned to this sector yet.
              </p>
            )}
          </div>
        </section>

        <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-3">
          <h3 className="text-sm font-semibold text-slate-900">
            {sector.name} Projects ({sectorProjects.length})
          </h3>
          <div className="divide-y divide-slate-100">
            {sectorProjects.map((p) => (
              <div key={p.id} className="py-2.5 space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-900">
                    {p.name} <span className="text-xs font-mono text-slate-400">({p.code})</span>
                  </span>
                  <span className="font-mono tabular-nums text-xs font-semibold text-emerald-700">
                    {p.latestProgressPct}%
                  </span>
                </div>
                <p className="text-xs text-slate-500 font-mono tabular-nums">
                  Budget {formatCurrency(p.budget)} · Spend {formatCurrency(p.expenditure)} · Revenue {formatCurrency(p.revenue)}
                </p>
              </div>
            ))}
            {sectorProjects.length === 0 && (
              <p className="py-4 text-xs text-slate-500">
                No projects registered under this sector yet.
              </p>
            )}
          </div>
        </section>
      </div>

      {/* Operational Log Modal */}
      {showLogModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Log ${sector.name} operational record`}
        >
          <div className="bg-white border border-slate-200 rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-base font-bold text-slate-900">
                New {sector.name} Record
              </h2>
              <button
                type="button"
                onClick={() => setShowLogModal(false)}
                aria-label="Close operational form"
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

            <form onSubmit={handleSubmit} className="space-y-3">
              {sector.slug === 'agriculture' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Crop Name" id="ag-crop" value={formState.cropName ?? ''} onChange={(v) => setField('cropName', v)} required />
                    <Field label="Plot Name" id="ag-plot" value={formState.plotName ?? ''} onChange={(v) => setField('plotName', v)} required />
                    <Field label="Planting Date" id="ag-pdate" type="date" value={formState.plantingDate ?? ''} onChange={(v) => setField('plantingDate', v)} required />
                    <div>
                      <label htmlFor="ag-stage" className="block text-xs font-medium text-slate-700 mb-1">Stage</label>
                      <select id="ag-stage" value={formState.stage ?? 'planted'} onChange={(e) => setField('stage', e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md">
                        <option value="planning">Planning</option>
                        <option value="planted">Planted</option>
                        <option value="growing">Growing</option>
                        <option value="harvested">Harvested</option>
                      </select>
                    </div>
                    <Field label="Input Cost ($)" id="ag-cost" type="number" value={formState.inputCost ?? '0'} onChange={(v) => setField('inputCost', v)} />
                    <Field label="Expected Yield (kg)" id="ag-exp" type="number" value={formState.expectedYieldKg ?? '0'} onChange={(v) => setField('expectedYieldKg', v)} />
                    <Field label="Actual Yield (kg)" id="ag-act" type="number" value={formState.actualYieldKg ?? '0'} onChange={(v) => setField('actualYieldKg', v)} />
                    <Field label="Harvest Date" id="ag-hdate" type="date" value={formState.harvestDate ?? ''} onChange={(v) => setField('harvestDate', v)} />
                  </div>
                  <Field label="Inputs Used" id="ag-inputs" value={formState.inputsUsed ?? ''} onChange={(v) => setField('inputsUsed', v)} />
                </>
              )}

              {sector.slug === 'piggery' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Batch Code" id="pg-code" value={formState.batchCode ?? ''} onChange={(v) => setField('batchCode', v)} required />
                    <div>
                      <label htmlFor="pg-cat" className="block text-xs font-medium text-slate-700 mb-1">Category</label>
                      <select id="pg-cat" value={formState.category ?? 'growers'} onChange={(e) => setField('category', e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md">
                        <option value="piglets">Piglets</option>
                        <option value="growers">Growers</option>
                        <option value="sows">Sows</option>
                        <option value="boars">Boars</option>
                      </select>
                    </div>
                    <Field label="Head Count" id="pg-head" type="number" value={formState.headCount ?? '0'} onChange={(v) => setField('headCount', v)} />
                    <Field label="Births" id="pg-births" type="number" value={formState.birthsCount ?? '0'} onChange={(v) => setField('birthsCount', v)} />
                    <Field label="Sales Count" id="pg-sales" type="number" value={formState.salesCount ?? '0'} onChange={(v) => setField('salesCount', v)} />
                    <Field label="Feed Cost ($)" id="pg-fcost" type="number" value={formState.feedCost ?? '0'} onChange={(v) => setField('feedCost', v)} />
                    <Field label="Operating Cost ($)" id="pg-ocost" type="number" value={formState.operatingCost ?? '0'} onChange={(v) => setField('operatingCost', v)} />
                    <Field label="Sales Revenue ($)" id="pg-rev" type="number" value={formState.salesRevenue ?? '0'} onChange={(v) => setField('salesRevenue', v)} />
                    <Field label="Record Date" id="pg-date" type="date" value={formState.recordDate ?? ''} onChange={(v) => setField('recordDate', v)} required />
                    <div>
                      <label htmlFor="pg-health" className="block text-xs font-medium text-slate-700 mb-1">Health Status</label>
                      <select id="pg-health" value={formState.healthStatus ?? 'healthy'} onChange={(e) => setField('healthStatus', e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md">
                        <option value="healthy">Healthy</option>
                        <option value="monitoring">Monitoring</option>
                        <option value="treatment">Treatment</option>
                      </select>
                    </div>
                  </div>
                  <Field label="Feed Plan" id="pg-feed" value={formState.feedPlan ?? ''} onChange={(v) => setField('feedPlan', v)} />
                </>
              )}

              {sector.slug === 'poultry' && (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Flock Code" id="pl-code" value={formState.flockCode ?? ''} onChange={(v) => setField('flockCode', v)} required />
                  <div>
                    <label htmlFor="pl-type" className="block text-xs font-medium text-slate-700 mb-1">Bird Type</label>
                    <select id="pl-type" value={formState.birdType ?? 'layers'} onChange={(e) => setField('birdType', e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md">
                      <option value="layers">Layers</option>
                      <option value="broilers">Broilers</option>
                      <option value="breeders">Breeders</option>
                    </select>
                  </div>
                  <Field label="Bird Count" id="pl-count" type="number" value={formState.birdCount ?? '0'} onChange={(v) => setField('birdCount', v)} />
                  <Field label="Mortality" id="pl-mort" type="number" value={formState.mortalityCount ?? '0'} onChange={(v) => setField('mortalityCount', v)} />
                  <Field label="Eggs Collected" id="pl-eggs" type="number" value={formState.eggsCollected ?? '0'} onChange={(v) => setField('eggsCollected', v)} />
                  <Field label="Feed Used (kg)" id="pl-fkg" type="number" value={formState.feedUsedKg ?? '0'} onChange={(v) => setField('feedUsedKg', v)} />
                  <Field label="Feed Cost ($)" id="pl-fcost" type="number" value={formState.feedCost ?? '0'} onChange={(v) => setField('feedCost', v)} />
                  <Field label="Sales Revenue ($)" id="pl-rev" type="number" value={formState.salesRevenue ?? '0'} onChange={(v) => setField('salesRevenue', v)} />
                  <Field label="Record Date" id="pl-date" type="date" value={formState.recordDate ?? ''} onChange={(v) => setField('recordDate', v)} required />
                </div>
              )}

              {sector.slug !== 'agriculture' &&
                sector.slug !== 'piggery' &&
                sector.slug !== 'poultry' && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Growing System Name" id="vf-sys" value={formState.systemName ?? ''} onChange={(v) => setField('systemName', v)} required />
                      <Field label="System Type" id="vf-type" value={formState.systemType ?? 'NFT Hydroponics'} onChange={(v) => setField('systemType', v)} />
                      <Field label="Crop Variety" id="vf-crop" value={formState.cropVariety ?? ''} onChange={(v) => setField('cropVariety', v)} required />
                      <Field label="Cycle Number" id="vf-cyc" type="number" value={formState.cycleNumber ?? '1'} onChange={(v) => setField('cycleNumber', v)} />
                      <Field label="Nutrient pH" id="vf-ph" type="number" step="0.1" value={formState.nutrientPh ?? '6.0'} onChange={(v) => setField('nutrientPh', v)} />
                      <Field label="EC Level (mS/cm)" id="vf-ec" type="number" step="0.1" value={formState.ecLevel ?? '1.8'} onChange={(v) => setField('ecLevel', v)} />
                      <Field label="Operating Cost ($)" id="vf-cost" type="number" value={formState.operatingCost ?? '0'} onChange={(v) => setField('operatingCost', v)} />
                      <Field label="Yield (kg)" id="vf-yield" type="number" value={formState.yieldKg ?? '0'} onChange={(v) => setField('yieldKg', v)} />
                      <Field label="Record Date" id="vf-date" type="date" value={formState.recordDate ?? ''} onChange={(v) => setField('recordDate', v)} required />
                    </div>
                    <Field label="Inputs & Calibration Notes" id="vf-notes" value={formState.inputsNote ?? ''} onChange={(v) => setField('inputsNote', v)} />
                  </>
                )}

              <div className="flex justify-end gap-2 pt-3">
                <button type="button" onClick={() => setShowLogModal(false)} className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-md">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="px-4 py-2 text-sm font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-md">
                  {submitting ? 'Saving...' : 'Save Record'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  accent?: boolean;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p
        className={`mt-1.5 text-xl font-bold font-mono tabular-nums ${
          accent ? 'text-emerald-700' : 'text-slate-900'
        }`}
      >
        {value}
      </p>
      <p className="mt-1 text-xs text-slate-500 font-mono tabular-nums truncate">
        {sub}
      </p>
    </div>
  );
}

function Field({
  label,
  id,
  value,
  onChange,
  type = 'text',
  required = false,
  step,
}: {
  label: string;
  id: string;
  value: string;
  onChange: (val: string) => void;
  type?: string;
  required?: boolean;
  step?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-slate-700 mb-1">
        {label}
      </label>
      <input
        id={id}
        type={type}
        step={step}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md"
      />
    </div>
  );
}
