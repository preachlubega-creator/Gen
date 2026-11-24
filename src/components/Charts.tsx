import { useState } from 'react';
import type { OrgFinanceSummary, SectorFinanceSummary } from '../domain/types.ts';
import { formatCurrency } from '../lib/format.ts';

export function SectorFinanceComparisonChart({
  sectors,
}: {
  sectors: SectorFinanceSummary[];
}) {
  const [hoveredSectorId, setHoveredSectorId] = useState<number | null>(null);

  const maxValue = Math.max(
    1,
    ...sectors.flatMap((s) => [
      s.allocated,
      s.actualExpenditure + s.projectInvestment,
      s.revenue,
    ])
  );

  const chartWidth = 680;
  const chartHeight = 250;
  const padLeft = 56;
  const padRight = 16;
  const padTop = 18;
  const padBottom = 38;
  const plotWidth = chartWidth - padLeft - padRight;
  const plotHeight = chartHeight - padTop - padBottom;

  const groupWidth = sectors.length > 0 ? plotWidth / sectors.length : plotWidth;
  const barWidth = Math.min(26, Math.max(12, (groupWidth - 28) / 3));

  const ticks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-5 text-xs text-slate-600">
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-xs bg-slate-800" />
            Allocated Budget
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-xs bg-amber-600" />
            Actual Spend (Ops + Projects)
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-xs bg-emerald-600" />
            Revenue Generated
          </span>
        </div>
        {hoveredSectorId !== null && (
          <div className="text-xs font-mono tabular-nums text-slate-600">
            {(() => {
              const s = sectors.find((item) => item.sectorId === hoveredSectorId);
              if (!s) return null;
              const spend = s.actualExpenditure + s.projectInvestment;
              return `${s.sectorName}: Allocated ${formatCurrency(s.allocated)} · Spend ${formatCurrency(spend)} · Revenue ${formatCurrency(s.revenue)}`;
            })()}
          </div>
        )}
      </div>

      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="w-full min-w-[520px] h-auto"
          role="img"
          aria-label="Sector financial comparison bar chart"
        >
          {ticks.map((t) => {
            const y = padTop + plotHeight - t * plotHeight;
            const val = Math.round(maxValue * t);
            return (
              <g key={t}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={chartWidth - padRight}
                  y2={y}
                  stroke="#e2e8f0"
                  strokeWidth="1"
                />
                <text
                  x={padLeft - 8}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-slate-400 text-[10px] font-mono tabular-nums"
                >
                  ${val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val}
                </text>
              </g>
            );
          })}

          {sectors.map((s, idx) => {
            const groupX = padLeft + idx * groupWidth;
            const centerX = groupX + groupWidth / 2;
            const totalSpend = s.actualExpenditure + s.projectInvestment;

            const hAlloc = (s.allocated / maxValue) * plotHeight;
            const hSpend = (totalSpend / maxValue) * plotHeight;
            const hRev = (s.revenue / maxValue) * plotHeight;

            const x0 = centerX - (barWidth * 3 + 8) / 2;
            const isHovered = hoveredSectorId === s.sectorId;

            return (
              <g
                key={s.sectorId}
                onMouseEnter={() => setHoveredSectorId(s.sectorId)}
                onMouseLeave={() => setHoveredSectorId(null)}
                className="cursor-pointer"
              >
                {isHovered && (
                  <rect
                    x={groupX + 6}
                    y={padTop}
                    width={groupWidth - 12}
                    height={plotHeight}
                    fill="#f1f5f9"
                    rx="4"
                  />
                )}
                <rect
                  x={x0}
                  y={padTop + plotHeight - hAlloc}
                  width={barWidth}
                  height={Math.max(2, hAlloc)}
                  fill="#1e293b"
                  rx="2"
                />
                <rect
                  x={x0 + barWidth + 4}
                  y={padTop + plotHeight - hSpend}
                  width={barWidth}
                  height={Math.max(2, hSpend)}
                  fill="#d97706"
                  rx="2"
                />
                <rect
                  x={x0 + (barWidth + 4) * 2}
                  y={padTop + plotHeight - hRev}
                  width={barWidth}
                  height={Math.max(2, hRev)}
                  fill="#059669"
                  rx="2"
                />
                <text
                  x={centerX}
                  y={chartHeight - 12}
                  textAnchor="middle"
                  className="fill-slate-700 text-[11px] font-medium"
                >
                  {s.sectorName}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

export function FundingCompositionBar({
  summary,
}: {
  summary: OrgFinanceSummary;
}) {
  const total = Math.max(1, summary.totalInflows);
  const items = [
    {
      label: 'Donations & Grants',
      amount: summary.donationsAndGrants,
      colorClass: 'bg-emerald-700',
    },
    {
      label: 'External Funding',
      amount: summary.externalFunding,
      colorClass: 'bg-slate-800',
    },
    {
      label: 'Sector Revenue',
      amount: summary.totalRevenue,
      colorClass: 'bg-emerald-500',
    },
    {
      label: 'Member Contributions',
      amount: summary.membershipContributions,
      colorClass: 'bg-amber-600',
    },
  ];

  return (
    <div className="space-y-4">
      <div className="h-3 w-full overflow-hidden rounded-sm bg-slate-100 flex">
        {items.map((item) => {
          const pct = (item.amount / total) * 100;
          if (pct <= 0) return null;
          return (
            <div
              key={item.label}
              style={{ width: `${pct}%` }}
              className={`${item.colorClass} h-full border-r border-white last:border-r-0`}
              title={`${item.label}: ${formatCurrency(item.amount)}`}
            />
          );
        })}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
        {items.map((item) => {
          const pct = ((item.amount / total) * 100).toFixed(1);
          return (
            <div
              key={item.label}
              className="flex items-center justify-between border-b border-slate-100 pb-2 text-xs"
            >
              <span className="flex items-center gap-2 text-slate-600">
                <span className={`h-2.5 w-2.5 rounded-xs ${item.colorClass}`} />
                {item.label}
              </span>
              <span className="font-mono tabular-nums font-medium text-slate-900">
                {formatCurrency(item.amount)}{' '}
                <span className="text-slate-400">({pct}%)</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
