import {
  BarChart3,
  Building2,
  ClipboardList,
  FolderKanban,
  Landmark,
  Layers,
  LogOut,
  ShieldCheck,
  Sprout,
  Users,
  X,
} from 'lucide-react';
import type { SectorDto, UserAccessContext } from '../domain/types.ts';
import { formatRoleLabel } from '../lib/format.ts';

export type ActiveNav =
  | { view: 'dashboard' }
  | { view: 'members' }
  | { view: 'finance' }
  | { view: 'projects' }
  | { view: 'reports' }
  | { view: 'governance' }
  | { view: 'sector'; sectorSlug: string };

interface SidebarProps {
  activeNav: ActiveNav;
  onNavigate: (nav: ActiveNav) => void;
  sectors: SectorDto[];
  access: UserAccessContext;
  pendingApprovalsCount: number;
  onSignOut: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({
  activeNav,
  onNavigate,
  sectors,
  access,
  pendingApprovalsCount,
  onSignOut,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const isSelected = (nav: ActiveNav) => {
    if (nav.view !== activeNav.view) return false;
    if (nav.view === 'sector' && activeNav.view === 'sector') {
      return nav.sectorSlug === activeNav.sectorSlug;
    }
    return true;
  };

  const navBtnClass = (selected: boolean) =>
    `w-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
      selected
        ? 'bg-emerald-700 text-white'
        : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
    }`;

  const content = (
    <div className="flex h-full w-64 flex-col bg-slate-900 text-slate-100 border-r border-slate-800">
      <div className="flex items-center justify-between px-4 py-4 border-b border-slate-800">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Sprout className="h-5 w-5 text-emerald-400 shrink-0" />
            <span className="font-display text-base font-bold tracking-tight text-white truncate">
              Gen Z AgriRise
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-400 truncate">
            Internal Operations Hub
          </p>
        </div>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close navigation menu"
          className="lg:hidden p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <nav
        className="flex-1 overflow-y-auto px-3 py-4 space-y-6"
        aria-label="Workspace navigation"
      >
        <div>
          <p className="px-3 mb-2 text-[11px] font-semibold tracking-wider text-slate-400">
            Organisation
          </p>
          <ul className="space-y-1">
            <li>
              <button
                type="button"
                onClick={() => {
                  onNavigate({ view: 'dashboard' });
                  onCloseMobile();
                }}
                className={navBtnClass(isSelected({ view: 'dashboard' }))}
              >
                <span className="flex items-center gap-2.5">
                  <Building2 className="h-4 w-4 shrink-0" />
                  <span>Overview</span>
                </span>
              </button>
            </li>
            {access.isGlobalAdmin ||
            access.globalPermissionKeys.includes('members.view') ||
            access.sectorRoles.some((sr) =>
              sr.permissionKeys.includes('members.view')
            ) ? (
              <li>
                <button
                  type="button"
                  onClick={() => {
                    onNavigate({ view: 'members' });
                    onCloseMobile();
                  }}
                  className={navBtnClass(isSelected({ view: 'members' }))}
                >
                  <span className="flex items-center gap-2.5">
                    <Users className="h-4 w-4 shrink-0" />
                    <span>Members</span>
                  </span>
                </button>
              </li>
            ) : null}
            {access.isGlobalAdmin ||
            access.globalPermissionKeys.includes('finance.view') ||
            access.sectorRoles.some((sr) =>
              sr.permissionKeys.includes('finance.view')
            ) ? (
              <li>
                <button
                  type="button"
                  onClick={() => {
                    onNavigate({ view: 'finance' });
                    onCloseMobile();
                  }}
                  className={navBtnClass(isSelected({ view: 'finance' }))}
                >
                  <span className="flex items-center gap-2.5">
                    <Landmark className="h-4 w-4 shrink-0" />
                    <span>Finance Ledger</span>
                  </span>
                  {pendingApprovalsCount > 0 && (
                    <span className="font-mono tabular-nums text-xs text-amber-400">
                      {pendingApprovalsCount}
                    </span>
                  )}
                </button>
              </li>
            ) : null}
            <li>
              <button
                type="button"
                onClick={() => {
                  onNavigate({ view: 'projects' });
                  onCloseMobile();
                }}
                className={navBtnClass(isSelected({ view: 'projects' }))}
              >
                <span className="flex items-center gap-2.5">
                  <FolderKanban className="h-4 w-4 shrink-0" />
                  <span>Projects</span>
                </span>
              </button>
            </li>
            {access.isGlobalAdmin ||
            access.globalPermissionKeys.includes('reports.export') ||
            access.sectorRoles.some((sr) =>
              sr.permissionKeys.includes('reports.export')
            ) ? (
              <li>
                <button
                  type="button"
                  onClick={() => {
                    onNavigate({ view: 'reports' });
                    onCloseMobile();
                  }}
                  className={navBtnClass(isSelected({ view: 'reports' }))}
                >
                  <span className="flex items-center gap-2.5">
                    <BarChart3 className="h-4 w-4 shrink-0" />
                    <span>Reports</span>
                  </span>
                </button>
              </li>
            ) : null}
          </ul>
        </div>

        <div>
          <p className="px-3 mb-2 text-[11px] font-semibold tracking-wider text-slate-400">
            Sectors
          </p>
          <ul className="space-y-1">
            {sectors.map((sector) => (
              <li key={sector.id}>
                <button
                  type="button"
                  onClick={() => {
                    onNavigate({ view: 'sector', sectorSlug: sector.slug });
                    onCloseMobile();
                  }}
                  className={navBtnClass(
                    isSelected({ view: 'sector', sectorSlug: sector.slug })
                  )}
                >
                  <span className="flex items-center gap-2.5 truncate">
                    <Layers className="h-4 w-4 shrink-0 text-slate-400" />
                    <span className="truncate">{sector.name}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="px-3 mb-2 text-[11px] font-semibold tracking-wider text-slate-400">
            Governance
          </p>
          <ul className="space-y-1">
            <li>
              <button
                type="button"
                onClick={() => {
                  onNavigate({ view: 'governance' });
                  onCloseMobile();
                }}
                className={navBtnClass(isSelected({ view: 'governance' }))}
              >
                <span className="flex items-center gap-2.5">
                  <ShieldCheck className="h-4 w-4 shrink-0" />
                  <span>RBAC & Audit</span>
                </span>
              </button>
            </li>
          </ul>
        </div>
      </nav>

      <div className="border-t border-slate-800 px-4 py-3.5">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium text-white truncate">
              {access.displayName}
            </p>
            <p className="text-xs text-slate-400 truncate">
              {formatRoleLabel(access.globalRoleSlug)}
            </p>
          </div>
          <button
            type="button"
            onClick={onSignOut}
            aria-label="Sign out"
            title="Sign out"
            className="p-2 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block shrink-0 h-screen sticky top-0">
        {content}
      </aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/60"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative z-10 h-full">{content}</div>
        </div>
      )}
    </>
  );
}
