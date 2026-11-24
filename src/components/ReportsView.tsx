import { useEffect, useState } from 'react';
import { Download, FileSpreadsheet } from 'lucide-react';
import { apiDownloadCsv, apiFetch } from '../lib/api.ts';

interface ReportPayload {
  reportType: string;
  title: string;
  generatedAt: string;
  columns: string[];
  rows: Array<Array<string | number>>;
}

const REPORT_CATALOG = [
  { id: 'organisational_performance', label: 'Organisational Performance' },
  { id: 'sector_finances', label: 'Sector Finances' },
  { id: 'funding_allocation', label: 'Funding & Allocations' },
  { id: 'project_expenditure', label: 'Project Expenditure' },
  { id: 'membership', label: 'Membership Roster' },
  { id: 'contributions', label: 'Member Contributions' },
  { id: 'agricultural_production', label: 'Agricultural Production' },
];

export function ReportsView({
  getToken,
}: {
  getToken: () => Promise<string | null>;
}) {
  const [activeReport, setActiveReport] = useState('organisational_performance');
  const [data, setData] = useState<ReportPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);
    apiFetch<ReportPayload>(`/api/reports/${activeReport}`, getToken)
      .then((res) => {
        if (mounted) setData(res);
      })
      .catch((err) => {
        if (mounted) {
          setError(
            err instanceof Error ? err.message : 'Unable to load report.'
          );
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [activeReport, getToken]);

  const handleExportCsv = async () => {
    try {
      await apiDownloadCsv(
        `/api/reports/${activeReport}?format=csv`,
        `genz-agririse-${activeReport}.csv`,
        getToken
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'CSV export failed.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-md">
          {REPORT_CATALOG.map((rep) => (
            <button
              key={rep.id}
              type="button"
              onClick={() => setActiveReport(rep.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-sm transition-colors whitespace-nowrap shrink-0 ${
                activeReport === rep.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {rep.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={handleExportCsv}
          disabled={!data || loading}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 rounded-md whitespace-nowrap shrink-0"
        >
          <Download className="h-4 w-4" />
          <span>Export CSV</span>
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <FileSpreadsheet className="h-4 w-4 text-emerald-700" />
            <h2 className="text-base font-semibold text-slate-900">
              {data?.title ?? 'Loading report...'}
            </h2>
          </div>
          {data && (
            <span className="text-xs font-mono text-slate-400">
              {data.rows.length} rows
            </span>
          )}
        </div>

        {loading ? (
          <div className="p-8 space-y-3">
            <div className="h-4 bg-slate-100 rounded w-1/3" />
            <div className="h-8 bg-slate-100 rounded w-full" />
            <div className="h-8 bg-slate-100 rounded w-full" />
          </div>
        ) : data ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                  {data.columns.map((col) => (
                    <th key={col} className="py-3 px-4 font-medium whitespace-nowrap">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.rows.map((row, rIdx) => (
                  <tr key={rIdx} className="hover:bg-slate-50/70">
                    {row.map((cell, cIdx) => (
                      <td
                        key={cIdx}
                        className="py-3 px-4 text-slate-800 font-mono tabular-nums text-xs"
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
                {data.rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={data.columns.length}
                      className="py-8 px-4 text-center text-sm text-slate-500"
                    >
                      No records available for this report.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  );
}
