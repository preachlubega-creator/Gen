import { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { Menu, RefreshCw, Sprout } from 'lucide-react';
import { auth, googleAuthProvider } from './lib/firebase.ts';
import { apiFetch } from './lib/api.ts';
import type {
  AuditLogDto,
  FinancialTransactionDto,
  MemberDto,
  OrgFinanceSummary,
  PermissionDto,
  ProjectDto,
  RoleDto,
  SectorDto,
  TransactionType,
  UserAccessContext,
} from './domain/types.ts';
import { Sidebar, type ActiveNav } from './components/Sidebar.tsx';
import { DashboardView } from './components/DashboardView.tsx';
import { MembersView } from './components/MembersView.tsx';
import { FinanceView } from './components/FinanceView.tsx';
import {
  SectorWorkspaceView,
  type AgRecord,
  type PiggeryRecord,
  type PoultryRecord,
  type VfRecord,
} from './components/SectorWorkspaceView.tsx';
import { ProjectsView } from './components/ProjectsView.tsx';
import { ReportsView } from './components/ReportsView.tsx';
import { GovernanceView } from './components/GovernanceView.tsx';

export default function App() {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [access, setAccess] = useState<UserAccessContext | null>(null);
  const [sectors, setSectors] = useState<SectorDto[]>([]);
  const [roles, setRoles] = useState<RoleDto[]>([]);
  const [permissions, setPermissions] = useState<PermissionDto[]>([]);
  const [members, setMembers] = useState<MemberDto[]>([]);
  const [financeSummary, setFinanceSummary] = useState<OrgFinanceSummary | null>(null);
  const [transactions, setTransactions] = useState<FinancialTransactionDto[]>([]);
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogDto[]>([]);
  const [agRecords, setAgRecords] = useState<AgRecord[]>([]);
  const [piggeryRecords, setPiggeryRecords] = useState<PiggeryRecord[]>([]);
  const [poultryRecords, setPoultryRecords] = useState<PoultryRecord[]>([]);
  const [vfRecords, setVfRecords] = useState<VfRecord[]>([]);

  const [activeNav, setActiveNav] = useState<ActiveNav>({ view: 'dashboard' });
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setAuthReady(true);
      if (!user) {
        setAccess(null);
      }
    });
    return () => unsub();
  }, []);

  const getToken = useCallback(async () => {
    if (!auth.currentUser) return null;
    return await auth.currentUser.getIdToken();
  }, []);

  const loadWorkspaceData = useCallback(async () => {
    if (!auth.currentUser) return;
    setLoadingData(true);
    setDataError(null);
    try {
      const meRes = await apiFetch<{ access: UserAccessContext }>(
        '/api/accounts/me',
        getToken
      );
      setAccess(meRes.access);

      const [
        secRes,
        rbacRes,
        memRes,
        finSumRes,
        finTxRes,
        projRes,
        agRes,
        pigRes,
        plRes,
        vfRes,
      ] = await Promise.all([
        apiFetch<{ sectors: SectorDto[] }>('/api/sectors', getToken),
        apiFetch<{ roles: RoleDto[]; permissions: PermissionDto[] }>(
          '/api/rbac',
          getToken
        ),
        apiFetch<{ members: MemberDto[] }>('/api/members', getToken).catch(
          () => ({ members: [] })
        ),
        apiFetch<{ summary: OrgFinanceSummary }>(
          '/api/finance/summary',
          getToken
        ).catch(() => ({ summary: null })),
        apiFetch<{ transactions: FinancialTransactionDto[] }>(
          '/api/finance/transactions',
          getToken
        ).catch(() => ({ transactions: [] })),
        apiFetch<{ projects: ProjectDto[] }>('/api/projects', getToken).catch(
          () => ({ projects: [] })
        ),
        apiFetch<{ records: AgRecord[] }>(
          '/api/operations/agriculture',
          getToken
        ).catch(() => ({ records: [] })),
        apiFetch<{ records: PiggeryRecord[] }>(
          '/api/operations/piggery',
          getToken
        ).catch(() => ({ records: [] })),
        apiFetch<{ records: PoultryRecord[] }>(
          '/api/operations/poultry',
          getToken
        ).catch(() => ({ records: [] })),
        apiFetch<{ records: VfRecord[] }>(
          '/api/operations/vertical-farming',
          getToken
        ).catch(() => ({ records: [] })),
      ]);

      setSectors(secRes.sectors);
      setRoles(rbacRes.roles);
      setPermissions(rbacRes.permissions);
      setMembers(memRes.members);
      if (finSumRes.summary) setFinanceSummary(finSumRes.summary);
      setTransactions(finTxRes.transactions);
      setProjects(projRes.projects);
      setAgRecords(agRes.records);
      setPiggeryRecords(pigRes.records);
      setPoultryRecords(plRes.records);
      setVfRecords(vfRes.records);

      // Load audit logs if authorized
      try {
        const auditRes = await apiFetch<{ logs: AuditLogDto[] }>(
          '/api/audit?limit=80',
          getToken
        );
        setAuditLogs(auditRes.logs);
      } catch {
        setAuditLogs([]);
      }
      setWorkspaceLoaded(true);
    } catch (err: unknown) {
      setDataError(
        err instanceof Error ? err.message : 'Failed to load workspace data.'
      );
    } finally {
      setLoadingData(false);
    }
  }, [getToken]);

  useEffect(() => {
    if (firebaseUser) {
      loadWorkspaceData();
    }
  }, [firebaseUser, loadWorkspaceData]);

  const handleGoogleSignIn = async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleAuthProvider);
    } catch (err: unknown) {
      setAuthError(
        err instanceof Error
          ? err.message
          : 'Unable to complete Google Sign-In.'
      );
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
  };

  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-sm text-slate-600">
        Loading workspace...
      </div>
    );
  }

  if (!firebaseUser) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 lg:p-10">
        <div className="w-full max-w-5xl bg-white border border-slate-200 rounded-xl overflow-hidden grid grid-cols-1 lg:grid-cols-2 items-stretch">
          <div className="p-8 lg:p-12 flex flex-col justify-between space-y-8">
            <div className="space-y-6">
              <div className="flex items-center gap-2.5 text-emerald-700">
                <Sprout className="h-6 w-6" />
                <span className="font-display text-lg font-bold tracking-tight text-slate-900">
                  Gen Z AgriRise
                </span>
              </div>

              <div className="space-y-3">
                <h1 className="text-3xl font-bold tracking-tight text-slate-900 text-balance">
                  Organisational Administration & Sector Operations
                </h1>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Internal management workspace for membership administration,
                  role-based governance, sector operations, project tracking, and
                  central financial controls.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100 text-xs text-slate-600">
                <div>Agriculture · Field Crops</div>
                <div>Piggery · Herd & Breeding</div>
                <div>Poultry · Flocks & Eggs</div>
                <div>Vertical Farming · Hydroponics</div>
              </div>
            </div>

            <div className="space-y-3">
              {authError && (
                <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                  {authError}
                </p>
              )}
              <button
                type="button"
                onClick={handleGoogleSignIn}
                className="w-full py-2.5 px-4 text-sm font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-md transition-colors flex items-center justify-center gap-2"
              >
                <span>Sign in with Google</span>
              </button>
              <p className="text-xs text-slate-500">
                Access is restricted to authorised Gen Z AgriRise administrators,
                sector leads, and registered members.
              </p>
            </div>
          </div>

          <div className="relative min-h-[280px] bg-slate-900">
            <img
              src="/src/assets/images/agririse_portal_hero_1795477085816.jpg"
              alt="Gen Z AgriRise youth vertical greenhouse and irrigated field plots"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover lg:h-full"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-slate-950/20 to-transparent flex items-end p-6">
              <p className="text-xs text-slate-100 font-medium">
                Youth empowerment and employment across four integrated agricultural sectors.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const currentTitle = (() => {
    if (activeNav.view === 'dashboard') return 'Organisation Overview';
    if (activeNav.view === 'members') return 'Member Management';
    if (activeNav.view === 'finance') return 'Central Financial Ledger';
    if (activeNav.view === 'projects') return 'Sector Projects';
    if (activeNav.view === 'reports') return 'Reports & Exports';
    if (activeNav.view === 'governance') return 'Roles, Permissions & Audit';
    if (activeNav.view === 'sector') {
      const sec = sectors.find((s) => s.slug === activeNav.sectorSlug);
      return sec ? `${sec.name} Sector` : 'Sector Workspace';
    }
    return 'Gen Z AgriRise';
  })();

  const activeSector =
    activeNav.view === 'sector'
      ? sectors.find((s) => s.slug === activeNav.sectorSlug) ?? null
      : null;

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      {access && (
        <Sidebar
          activeNav={activeNav}
          onNavigate={setActiveNav}
          sectors={sectors}
          access={access}
          pendingApprovalsCount={financeSummary?.pendingApprovalCount ?? 0}
          onSignOut={handleSignOut}
          mobileOpen={mobileNavOpen}
          onCloseMobile={() => setMobileNavOpen(false)}
        />
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Breadcrumb Bar */}
        <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-4 lg:px-8 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-2 rounded-md text-slate-600 hover:bg-slate-100"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-400 hidden sm:inline whitespace-nowrap">
                Gen Z AgriRise
              </span>
              <span className="text-slate-300 hidden sm:inline">/</span>
              <h1 className="font-display text-base font-bold text-slate-900 truncate">
                {currentTitle}
              </h1>
            </div>
          </div>

          <button
            type="button"
            onClick={loadWorkspaceData}
            disabled={loadingData}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md whitespace-nowrap shrink-0"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${loadingData ? 'animate-spin' : ''}`}
            />
            <span>Refresh Data</span>
          </button>
        </header>

        <main className="flex-1 p-4 lg:p-8 max-w-[1400px] w-full mx-auto">
          {dataError && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
              {dataError}
            </div>
          )}

          {!access || !workspaceLoaded ? (
            <div className="bg-white border border-slate-200 rounded-lg p-8 space-y-4">
              <div className="h-5 bg-slate-100 rounded w-1/4" />
              <div className="grid grid-cols-4 gap-4">
                <div className="h-24 bg-slate-100 rounded" />
                <div className="h-24 bg-slate-100 rounded" />
                <div className="h-24 bg-slate-100 rounded" />
                <div className="h-24 bg-slate-100 rounded" />
              </div>
            </div>
          ) : activeNav.view === 'dashboard' ? (
            financeSummary ? (
              <DashboardView
                financeSummary={financeSummary}
                members={members}
                projects={projects}
                auditLogs={auditLogs}
                onNavigate={setActiveNav}
              />
            ) : (
              <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-3">
                <h2 className="text-base font-semibold text-slate-900">
                  Welcome to Gen Z AgriRise
                </h2>
                <p className="text-sm text-slate-600">
                  Select an assigned sector or Projects from the workspace sidebar to view operational records and milestones.
                </p>
              </div>
            )
          ) : activeNav.view === 'members' ? (
            <MembersView
              members={members}
              sectors={sectors}
              roles={roles}
              access={access}
              onCreateMember={async (payload) => {
                await apiFetch('/api/members', getToken, {
                  method: 'POST',
                  body: JSON.stringify(payload),
                });
                await loadWorkspaceData();
              }}
              onUpdateMember={async (memberId, payload) => {
                await apiFetch(`/api/members/${memberId}`, getToken, {
                  method: 'PATCH',
                  body: JSON.stringify(payload),
                });
                await loadWorkspaceData();
              }}
              onRecordPayment={async (memberId, payload) => {
                await apiFetch(`/api/members/${memberId}/payments`, getToken, {
                  method: 'POST',
                  body: JSON.stringify(payload),
                });
                await loadWorkspaceData();
              }}
            />
          ) : activeNav.view === 'finance' ? (
            financeSummary ? (
              <FinanceView
                summary={financeSummary}
                transactions={transactions}
                sectors={sectors}
                projects={projects}
                access={access}
                onCreateTransaction={async (payload: {
                  reference: string;
                  txType: TransactionType;
                  amount: number;
                  txDate: string;
                  description: string;
                  sectorId: number | null;
                  projectId: number | null;
                  counterparty: string;
                  approveImmediately: boolean;
                }) => {
                  await apiFetch('/api/finance/transactions', getToken, {
                    method: 'POST',
                    body: JSON.stringify(payload),
                  });
                  await loadWorkspaceData();
                }}
                onDecideTransaction={async (id, decision, rejectionReason) => {
                  await apiFetch(`/api/finance/transactions/${id}/approve`, getToken, {
                    method: 'POST',
                    body: JSON.stringify({ decision, rejectionReason }),
                  });
                  await loadWorkspaceData();
                }}
                onReverseTransaction={async (id, reason) => {
                  await apiFetch(`/api/finance/transactions/${id}/reverse`, getToken, {
                    method: 'POST',
                    body: JSON.stringify({ reason }),
                  });
                  await loadWorkspaceData();
                }}
              />
            ) : (
              <div className="bg-white border border-slate-200 rounded-lg p-6 text-sm text-slate-600">
                Financial ledger access requires the finance.view permission.
              </div>
            )
          ) : activeNav.view === 'sector' && activeSector ? (
            <SectorWorkspaceView
              sector={activeSector}
              finance={financeSummary?.sectorBreakdown.find(
                (b) => b.sectorId === activeSector.id
              )}
              members={members}
              projects={projects}
              agRecords={agRecords}
              piggeryRecords={piggeryRecords}
              poultryRecords={poultryRecords}
              vfRecords={vfRecords}
              access={access}
              onLogOperation={async (sectorSlug, payload) => {
                const endpoint =
                  sectorSlug === 'agriculture'
                    ? '/api/operations/agriculture'
                    : sectorSlug === 'piggery'
                    ? '/api/operations/piggery'
                    : sectorSlug === 'poultry'
                    ? '/api/operations/poultry'
                    : '/api/operations/vertical-farming';
                await apiFetch(endpoint, getToken, {
                  method: 'POST',
                  body: JSON.stringify(payload),
                });
                await loadWorkspaceData();
              }}
            />
          ) : activeNav.view === 'projects' ? (
            <ProjectsView
              projects={projects}
              sectors={sectors}
              members={members}
              access={access}
              onCreateProject={async (payload) => {
                await apiFetch('/api/projects', getToken, {
                  method: 'POST',
                  body: JSON.stringify(payload),
                });
                await loadWorkspaceData();
              }}
              onLogProgress={async (projectId, payload) => {
                await apiFetch(`/api/projects/${projectId}/progress`, getToken, {
                  method: 'POST',
                  body: JSON.stringify(payload),
                });
                await loadWorkspaceData();
              }}
            />
          ) : activeNav.view === 'reports' ? (
            <ReportsView getToken={getToken} />
          ) : (
            <GovernanceView
              roles={roles}
              permissions={permissions}
              auditLogs={auditLogs}
              sectors={sectors}
              access={access}
              onUpdateRolePermissions={async (roleId, permissionKeys) => {
                await apiFetch(`/api/rbac/roles/${roleId}/permissions`, getToken, {
                  method: 'PUT',
                  body: JSON.stringify({ permissionKeys }),
                });
                await loadWorkspaceData();
              }}
              onCreateSector={async (payload) => {
                await apiFetch('/api/sectors', getToken, {
                  method: 'POST',
                  body: JSON.stringify(payload),
                });
                await loadWorkspaceData();
              }}
            />
          )}
        </main>
      </div>
    </div>
  );
}
