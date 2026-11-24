import { count } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  agricultureRecords,
  auditLogs,
  financialTransactions,
  memberPayments,
  members,
  memberSectorRoles,
  permissions,
  piggeryRecords,
  poultryRecords,
  projectProgressLogs,
  projects,
  rolePermissions,
  roles,
  sectors,
  verticalFarmingRecords,
} from '../db/schema.ts';

let seedPromise: Promise<void> | null = null;

const INITIAL_PERMISSIONS = [
  {
    key: 'dashboard.view',
    label: 'View Organisation Dashboard',
    module: 'Organisation',
    description: 'Access the central organisation dashboard and high-level summaries.',
  },
  {
    key: 'members.view',
    label: 'View Members',
    module: 'Members',
    description: 'View member directory, assigned sectors, and balances.',
  },
  {
    key: 'members.write',
    label: 'Register & Edit Members',
    module: 'Members',
    description: 'Create member profiles and update sector/role assignments.',
  },
  {
    key: 'members.payments',
    label: 'Record Member Payments',
    module: 'Members',
    description: 'Record membership contributions and view payment history.',
  },
  {
    key: 'finance.view',
    label: 'View Financial Ledger',
    module: 'Finance',
    description: 'Inspect central financial ledger, allocations, and balances.',
  },
  {
    key: 'finance.record',
    label: 'Submit Financial Transactions',
    module: 'Finance',
    description: 'Log external funding, expenses, investments, and revenue.',
  },
  {
    key: 'finance.approve',
    label: 'Approve & Reverse Transactions',
    module: 'Finance',
    description: 'Approve pending financial expenses, allocate sector funds, or post reversals.',
  },
  {
    key: 'projects.view',
    label: 'View Projects',
    module: 'Projects',
    description: 'View sector projects, budgets, and progress logs.',
  },
  {
    key: 'projects.manage',
    label: 'Manage Projects',
    module: 'Projects',
    description: 'Create projects, update statuses, and record milestone logs.',
  },
  {
    key: 'operations.view',
    label: 'View Sector Operations',
    module: 'Operations',
    description: 'View crop cycles, livestock batches, flocks, and hydroponic systems.',
  },
  {
    key: 'operations.write',
    label: 'Log Sector Operations',
    module: 'Operations',
    description: 'Create and update sector-specific operational records.',
  },
  {
    key: 'reports.export',
    label: 'Generate & Export Reports',
    module: 'Reporting',
    description: 'Run organisational reports and download CSV exports.',
  },
  {
    key: 'audit.view',
    label: 'View Audit Trail',
    module: 'Security',
    description: 'Inspect immutable administrative and financial audit logs.',
  },
  {
    key: 'rbac.manage',
    label: 'Configure Roles & Permissions',
    module: 'Security',
    description: 'Modify role permission assignments and manage user access levels.',
  },
];

const INITIAL_ROLES = [
  {
    slug: 'founder',
    name: 'Founder / Super Administrator',
    description: 'Unrestricted governance across all sectors, financial approvals, and RBAC.',
    rank: 100,
    isSystem: true,
    perms: INITIAL_PERMISSIONS.map((p) => p.key),
  },
  {
    slug: 'admin',
    name: 'Administrator',
    description: 'Full operational, membership, financial, and reporting control across sectors.',
    rank: 80,
    isSystem: true,
    perms: [
      'dashboard.view',
      'members.view',
      'members.write',
      'members.payments',
      'finance.view',
      'finance.record',
      'finance.approve',
      'projects.view',
      'projects.manage',
      'operations.view',
      'operations.write',
      'reports.export',
      'audit.view',
    ],
  },
  {
    slug: 'sector_manager',
    name: 'Sector Manager',
    description: 'Leads assigned sector operations, projects, and expense submissions.',
    rank: 60,
    isSystem: true,
    perms: [
      'dashboard.view',
      'members.view',
      'finance.view',
      'finance.record',
      'projects.view',
      'projects.manage',
      'operations.view',
      'operations.write',
      'reports.export',
    ],
  },
  {
    slug: 'team_leader',
    name: 'Team Leader',
    description: 'Coordinates daily field logs and project progress within assigned sectors.',
    rank: 40,
    isSystem: true,
    perms: [
      'dashboard.view',
      'members.view',
      'projects.view',
      'projects.manage',
      'operations.view',
      'operations.write',
    ],
  },
  {
    slug: 'member',
    name: 'General Member',
    description: 'Views organisational overview, assigned sector workspaces, and personal records.',
    rank: 20,
    isSystem: true,
    perms: ['dashboard.view', 'projects.view', 'operations.view'],
  },
];

async function runSeed() {
  const [{ value: sectorCount }] = await db.select({ value: count() }).from(sectors);
  if (Number(sectorCount) > 0) {
    return;
  }

  await db.transaction(async (tx) => {
    const insertedPerms = await tx
      .insert(permissions)
      .values(INITIAL_PERMISSIONS)
      .returning();
    const permIdByKey = new Map(insertedPerms.map((p) => [p.key, p.id]));

    const roleIdBySlug = new Map<string, number>();
    for (const r of INITIAL_ROLES) {
      const [roleRow] = await tx
        .insert(roles)
        .values({
          slug: r.slug,
          name: r.name,
          description: r.description,
          rank: r.rank,
          isSystem: r.isSystem,
        })
        .returning();
      roleIdBySlug.set(r.slug, roleRow.id);

      const rpRows = r.perms
        .map((key) => permIdByKey.get(key))
        .filter((id): id is number => typeof id === 'number')
        .map((permissionId) => ({
          roleId: roleRow.id,
          permissionId,
        }));
      if (rpRows.length > 0) {
        await tx.insert(rolePermissions).values(rpRows);
      }
    }

    const insertedSectors = await tx
      .insert(sectors)
      .values([
        {
          slug: 'agriculture',
          name: 'Agriculture',
          description: 'Open-field youth demonstration plots, high-value horticulture, and staple crops.',
          focusArea: 'Crops, soil inputs, drip irrigation & harvests',
          isActive: true,
        },
        {
          slug: 'piggery',
          name: 'Piggery',
          description: 'Youth-operated commercial swine breeding, fattening pens, and biosecurity.',
          focusArea: 'Livestock batches, breeding, feed & herd sales',
          isActive: true,
        },
        {
          slug: 'poultry',
          name: 'Poultry',
          description: 'Deep-litter layer and broiler units supplying regional fresh eggs and meat.',
          focusArea: 'Flock health, daily egg collection & feed conversion',
          isActive: true,
        },
        {
          slug: 'vertical_farming',
          name: 'Vertical Farming',
          description: 'Climate-smart hydroponic towers and NFT channels for urban leafy greens.',
          focusArea: 'Growing systems, pH/EC calibration & rapid cycles',
          isActive: true,
        },
      ])
      .returning();

    const secId = (slug: string) =>
      insertedSectors.find((s) => s.slug === slug)!.id;
    const roleId = (slug: string) => roleIdBySlug.get(slug)!;

    const insertedMembers = await tx
      .insert(members)
      .values([
        {
          memberCode: 'GZA-001',
          fullName: 'Amara Okafor',
          email: 'amara.okafor@genzagririse.org',
          phone: '+256 772 410 118',
          location: 'Central Hub — Wakiso',
          dateJoined: '2025-02-14',
          status: 'active',
          contributionRequired: '300.00',
          notes: 'Co-lead for field agronomy and youth training cohorts.',
        },
        {
          memberCode: 'GZA-002',
          fullName: 'Brian Mugisha',
          email: 'brian.mugisha@genzagririse.org',
          phone: '+256 701 889 204',
          location: 'Mukono Farmstead',
          dateJoined: '2025-03-02',
          status: 'active',
          contributionRequired: '300.00',
          notes: 'Certified livestock technician overseeing piggery & poultry feed formulation.',
        },
        {
          memberCode: 'GZA-003',
          fullName: 'Chloe Namukasa',
          email: 'chloe.namukasa@genzagririse.org',
          phone: '+256 784 220 519',
          location: 'Kampala Urban Lab',
          dateJoined: '2025-03-19',
          status: 'active',
          contributionRequired: '300.00',
          notes: 'Leads hydroponic nutrient calibration and urban off-taker contracts.',
        },
        {
          memberCode: 'GZA-004',
          fullName: 'Daniel Ssemakula',
          email: 'daniel.ssemakula@genzagririse.org',
          phone: '+256 755 901 334',
          location: 'Mukono Farmstead',
          dateJoined: '2025-04-08',
          status: 'active',
          contributionRequired: '250.00',
          notes: 'Coordinates daily egg collection and biosecurity logbooks.',
        },
        {
          memberCode: 'GZA-005',
          fullName: 'Esther Nabirye',
          email: 'esther.nabirye@genzagririse.org',
          phone: '+256 779 312 640',
          location: 'Wakiso North Plots',
          dateJoined: '2025-05-11',
          status: 'active',
          contributionRequired: '250.00',
          notes: 'Field team leader for drip-irrigated tomato and pepper blocks.',
        },
        {
          memberCode: 'GZA-006',
          fullName: 'Felix Kiggundu',
          email: 'felix.kiggundu@genzagririse.org',
          phone: '+256 704 615 892',
          location: 'Kampala Urban Lab',
          dateJoined: '2025-06-22',
          status: 'active',
          contributionRequired: '250.00',
          notes: 'Supports vertical tower transplanting and market packaging.',
        },
        {
          memberCode: 'GZA-007',
          fullName: 'Grace Atwine',
          email: 'grace.atwine@genzagririse.org',
          phone: '+256 781 554 027',
          location: 'Mukono Farmstead',
          dateJoined: '2025-08-05',
          status: 'active',
          contributionRequired: '200.00',
          notes: 'Youth apprentice across piggery growers and poultry brooder house.',
        },
      ])
      .returning();

    const memId = (code: string) =>
      insertedMembers.find((m) => m.memberCode === code)!.id;

    // Multi-sector assignments demonstrating unique member profiles with distinct roles per sector
    await tx.insert(memberSectorRoles).values([
      { memberId: memId('GZA-001'), sectorId: secId('agriculture'), roleId: roleId('sector_manager'), isPrimary: true },
      { memberId: memId('GZA-001'), sectorId: secId('vertical_farming'), roleId: roleId('team_leader'), isPrimary: false },
      { memberId: memId('GZA-002'), sectorId: secId('piggery'), roleId: roleId('sector_manager'), isPrimary: true },
      { memberId: memId('GZA-002'), sectorId: secId('poultry'), roleId: roleId('team_leader'), isPrimary: false },
      { memberId: memId('GZA-003'), sectorId: secId('vertical_farming'), roleId: roleId('sector_manager'), isPrimary: true },
      { memberId: memId('GZA-004'), sectorId: secId('poultry'), roleId: roleId('sector_manager'), isPrimary: true },
      { memberId: memId('GZA-005'), sectorId: secId('agriculture'), roleId: roleId('team_leader'), isPrimary: true },
      { memberId: memId('GZA-006'), sectorId: secId('vertical_farming'), roleId: roleId('team_leader'), isPrimary: true },
      { memberId: memId('GZA-006'), sectorId: secId('agriculture'), roleId: roleId('member'), isPrimary: false },
      { memberId: memId('GZA-007'), sectorId: secId('piggery'), roleId: roleId('member'), isPrimary: true },
      { memberId: memId('GZA-007'), sectorId: secId('poultry'), roleId: roleId('member'), isPrimary: false },
    ]);

    const insertedProjects = await tx
      .insert(projects)
      .values([
        {
          sectorId: secId('agriculture'),
          managerMemberId: memId('GZA-001'),
          code: 'PRJ-AG-01',
          name: 'Solar Drip Horticulture Expansion',
          description: '3-acre solar-pumped drip irrigation grid for year-round bell peppers and French beans.',
          budget: '8500.00',
          status: 'active',
          startDate: '2026-07-10',
          targetEndDate: '2026-12-20',
        },
        {
          sectorId: secId('piggery'),
          managerMemberId: memId('GZA-002'),
          code: 'PRJ-PG-01',
          name: 'Farrowing Wing & Biogas Digester',
          description: '6-pen slatted farrowing unit paired with waste-to-biogas slurry digestion.',
          budget: '11200.00',
          status: 'active',
          startDate: '2026-08-01',
          targetEndDate: '2027-01-30',
        },
        {
          sectorId: secId('poultry'),
          managerMemberId: memId('GZA-004'),
          code: 'PRJ-PL-01',
          name: 'Layer House B — 1,500 Birds',
          description: 'Automated nipple-drinker deep litter house scaling commercial tray output.',
          budget: '9400.00',
          status: 'active',
          startDate: '2026-06-15',
          targetEndDate: '2026-12-15',
        },
        {
          sectorId: secId('vertical_farming'),
          managerMemberId: memId('GZA-003'),
          code: 'PRJ-VF-01',
          name: 'NFT Leafy Greens Urban Pod',
          description: '240-channel indoor LED & nutrient-film rack targeting hospitality kitchens.',
          budget: '7600.00',
          status: 'active',
          startDate: '2026-09-01',
          targetEndDate: '2027-02-15',
        },
      ])
      .returning();

    const prjId = (code: string) =>
      insertedProjects.find((p) => p.code === code)!.id;

    await tx.insert(projectProgressLogs).values([
      {
        projectId: prjId('PRJ-AG-01'),
        milestonePct: 72,
        summary: 'Mainline PVC and 18 drip laterals pressure-tested; first pepper transplant complete.',
        logDate: '2026-10-28',
      },
      {
        projectId: prjId('PRJ-PG-01'),
        milestonePct: 55,
        summary: 'Concrete floor slabs cured and gestation crates installed; digester dome masonry underway.',
        logDate: '2026-11-04',
      },
      {
        projectId: prjId('PRJ-PL-01'),
        milestonePct: 88,
        summary: 'Point-of-lay pullets housed; daily lay rate reached 81% across Block B.',
        logDate: '2026-11-12',
      },
      {
        projectId: prjId('PRJ-VF-01'),
        milestonePct: 64,
        summary: 'Nutrient dosing manifold calibrated; Batch 4 butterhead lettuce harvested at 195 kg.',
        logDate: '2026-11-15',
      },
    ]);

    // Financial Ledger Seed (clearly separating funding, allocations, expenditures, and revenue)
    const txRows = await tx
      .insert(financialTransactions)
      .values([
        {
          reference: 'TX-GRANT-2026-001',
          txType: 'donation_grant',
          amount: '28000.00',
          txDate: '2026-07-02',
          description: 'East Africa Youth Agri-Innovation Catalyst Grant (Tranche 1)',
          counterparty: 'AgriFuture Foundation',
          approvalStatus: 'approved',
          approvedAt: new Date('2026-07-02T10:00:00Z'),
        },
        {
          reference: 'TX-EXT-2026-002',
          txType: 'external_funding',
          amount: '12500.00',
          txDate: '2026-08-14',
          description: 'Impact Revolving Facility for Climate-Smart Infrastructure',
          counterparty: 'GreenVenture Partners',
          approvalStatus: 'approved',
          approvedAt: new Date('2026-08-14T11:30:00Z'),
        },
        {
          reference: 'TX-ALLOC-AG-01',
          txType: 'sector_allocation',
          amount: '9500.00',
          txDate: '2026-07-10',
          description: 'H2 2026 Operational & Project Allocation — Agriculture',
          sectorId: secId('agriculture'),
          approvalStatus: 'approved',
          approvedAt: new Date('2026-07-10T09:00:00Z'),
        },
        {
          reference: 'TX-ALLOC-PG-01',
          txType: 'sector_allocation',
          amount: '11500.00',
          txDate: '2026-08-01',
          description: 'H2 2026 Operational & Breeding Allocation — Piggery',
          sectorId: secId('piggery'),
          approvalStatus: 'approved',
          approvedAt: new Date('2026-08-01T09:00:00Z'),
        },
        {
          reference: 'TX-ALLOC-PL-01',
          txType: 'sector_allocation',
          amount: '10000.00',
          txDate: '2026-07-15',
          description: 'H2 2026 Flock & Feed Allocation — Poultry',
          sectorId: secId('poultry'),
          approvalStatus: 'approved',
          approvedAt: new Date('2026-07-15T09:00:00Z'),
        },
        {
          reference: 'TX-ALLOC-VF-01',
          txType: 'sector_allocation',
          amount: '8200.00',
          txDate: '2026-09-01',
          description: 'H2 2026 Hydroponic Pod Allocation — Vertical Farming',
          sectorId: secId('vertical_farming'),
          approvalStatus: 'approved',
          approvedAt: new Date('2026-09-01T09:00:00Z'),
        },
        {
          reference: 'TX-INV-AG-101',
          txType: 'project_investment',
          amount: '5200.00',
          txDate: '2026-07-22',
          description: 'Solar submersible pump, drip manifolds & UV mulch film',
          sectorId: secId('agriculture'),
          projectId: prjId('PRJ-AG-01'),
          counterparty: 'IrrigateTech Ltd',
          approvalStatus: 'approved',
          approvedAt: new Date('2026-07-22T14:00:00Z'),
        },
        {
          reference: 'TX-EXP-AG-102',
          txType: 'operational_expense',
          amount: '1340.00',
          txDate: '2026-09-12',
          description: 'Organic foliar fertilizer, hybrid F1 seeds & biological pest control',
          sectorId: secId('agriculture'),
          projectId: prjId('PRJ-AG-01'),
          counterparty: 'AgroInputs Co-op',
          approvalStatus: 'approved',
          approvedAt: new Date('2026-09-12T16:15:00Z'),
        },
        {
          reference: 'TX-INV-PG-201',
          txType: 'project_investment',
          amount: '6800.00',
          txDate: '2026-08-18',
          description: 'Farrowing pen steelwork & 12 Landrace breeding gilts',
          sectorId: secId('piggery'),
          projectId: prjId('PRJ-PG-01'),
          counterparty: 'Highland Genetics',
          approvalStatus: 'approved',
          approvedAt: new Date('2026-08-18T11:00:00Z'),
        },
        {
          reference: 'TX-EXP-PG-202',
          txType: 'operational_expense',
          amount: '2150.00',
          txDate: '2026-10-05',
          description: 'Sow lactation & grower concentrate feed batch (4.5 tonnes)',
          sectorId: secId('piggery'),
          counterparty: 'NutriMix Mills',
          approvalStatus: 'approved',
          approvedAt: new Date('2026-10-05T13:20:00Z'),
        },
        {
          reference: 'TX-INV-PL-301',
          txType: 'project_investment',
          amount: '5900.00',
          txDate: '2026-07-25',
          description: '1,500 ISA Brown pullets & drinker automation kit',
          sectorId: secId('poultry'),
          projectId: prjId('PRJ-PL-01'),
          counterparty: 'Valley Hatcheries',
          approvalStatus: 'approved',
          approvedAt: new Date('2026-07-25T15:00:00Z'),
        },
        {
          reference: 'TX-EXP-PL-302',
          txType: 'operational_expense',
          amount: '2480.00',
          txDate: '2026-10-18',
          description: 'Layer mash & Newcastle/Gumboro cold-chain vaccines',
          sectorId: secId('poultry'),
          projectId: prjId('PRJ-PL-01'),
          counterparty: 'VetCare Distributors',
          approvalStatus: 'approved',
          approvedAt: new Date('2026-10-18T10:45:00Z'),
        },
        {
          reference: 'TX-INV-VF-401',
          txType: 'project_investment',
          amount: '4900.00',
          txDate: '2026-09-09',
          description: 'NFT food-grade PVC channels, full-spectrum LEDs & EC/pH controllers',
          sectorId: secId('vertical_farming'),
          projectId: prjId('PRJ-VF-01'),
          counterparty: 'HydroBuild Systems',
          approvalStatus: 'approved',
          approvedAt: new Date('2026-09-09T12:00:00Z'),
        },
        {
          reference: 'TX-EXP-VF-402',
          txType: 'operational_expense',
          amount: '890.00',
          txDate: '2026-11-18',
          description: 'Hydroponic A+B mineral salts & solar inverter maintenance',
          sectorId: secId('vertical_farming'),
          projectId: prjId('PRJ-VF-01'),
          counterparty: 'UrbanGrow Labs',
          approvalStatus: 'pending',
        },
        {
          reference: 'TX-REV-AG-501',
          txType: 'revenue',
          amount: '3850.00',
          txDate: '2026-10-30',
          description: 'Wholesale bell pepper & French bean harvest settlement',
          sectorId: secId('agriculture'),
          projectId: prjId('PRJ-AG-01'),
          counterparty: 'FreshMart Supermarkets',
          approvalStatus: 'approved',
          approvedAt: new Date('2026-10-30T17:00:00Z'),
        },
        {
          reference: 'TX-REV-PL-502',
          txType: 'revenue',
          amount: '4620.00',
          txDate: '2026-11-10',
          description: 'October–November commercial egg tray off-take (1,050 trays)',
          sectorId: secId('poultry'),
          projectId: prjId('PRJ-PL-01'),
          counterparty: 'Metro Bakers & Hotels',
          approvalStatus: 'approved',
          approvedAt: new Date('2026-11-10T16:30:00Z'),
        },
        {
          reference: 'TX-REV-PG-503',
          txType: 'revenue',
          amount: '3100.00',
          txDate: '2026-11-12',
          description: 'Sale of 14 finished porkers (Batch PG-2026-B)',
          sectorId: secId('piggery'),
          projectId: prjId('PRJ-PG-01'),
          counterparty: 'Prime Cuts Abattoir',
          approvalStatus: 'approved',
          approvedAt: new Date('2026-11-12T14:15:00Z'),
        },
        {
          reference: 'TX-REV-VF-504',
          txType: 'revenue',
          amount: '2340.00',
          txDate: '2026-11-16',
          description: 'Hydroponic butterhead lettuce & basil hotel supply',
          sectorId: secId('vertical_farming'),
          projectId: prjId('PRJ-VF-01'),
          counterparty: 'Serena Hospitality Group',
          approvalStatus: 'approved',
          approvedAt: new Date('2026-11-16T15:00:00Z'),
        },
      ])
      .returning();

    // Seed Member Contribution Payments linked atomically to financialTransactions
    const contribEntries = [
      { code: 'GZA-001', amount: '300.00', date: '2026-07-05', method: 'Bank Transfer', ref: 'PAY-GZA001-01' },
      { code: 'GZA-002', amount: '300.00', date: '2026-07-08', method: 'Mobile Money', ref: 'PAY-GZA002-01' },
      { code: 'GZA-003', amount: '180.00', date: '2026-08-03', method: 'Mobile Money', ref: 'PAY-GZA003-01' },
      { code: 'GZA-004', amount: '250.00', date: '2026-08-19', method: 'Bank Transfer', ref: 'PAY-GZA004-01' },
      { code: 'GZA-005', amount: '125.00', date: '2026-09-14', method: 'Mobile Money', ref: 'PAY-GZA005-01' },
      { code: 'GZA-006', amount: '250.00', date: '2026-10-02', method: 'Cash Deposit', ref: 'PAY-GZA006-01' },
    ];

    for (const c of contribEntries) {
      const mId = memId(c.code);
      const [ftx] = await tx
        .insert(financialTransactions)
        .values({
          reference: `TX-${c.ref}`,
          txType: 'membership_contribution',
          amount: c.amount,
          txDate: c.date,
          description: `Membership contribution payment (${c.code})`,
          memberId: mId,
          counterparty: c.code,
          approvalStatus: 'approved',
          approvedAt: new Date(`${c.date}T12:00:00Z`),
        })
        .returning();

      await tx.insert(memberPayments).values({
        memberId: mId,
        transactionId: ftx.id,
        amount: c.amount,
        paymentDate: c.date,
        paymentMethod: c.method,
        reference: c.ref,
        notes: 'Verified membership contribution installment',
      });
    }

    // Seed Sector-Specific Operational Records
    await tx.insert(agricultureRecords).values([
      {
        sectorId: secId('agriculture'),
        projectId: prjId('PRJ-AG-01'),
        cropName: 'California Wonder Bell Peppers',
        plotName: 'Block A — North Drip (1.4 acres)',
        plantingDate: '2026-08-10',
        harvestDate: '2026-10-29',
        stage: 'harvested',
        inputsUsed: 'NPK 17-17-17, Vermicompost, Neem bio-spray',
        inputCost: '720.00',
        expectedYieldKg: '1800.00',
        actualYieldKg: '1940.00',
        notes: 'Exceeded expected yield by 7.7% due to moisture stability.',
      },
      {
        sectorId: secId('agriculture'),
        projectId: prjId('PRJ-AG-01'),
        cropName: 'Serengeti French Beans',
        plotName: 'Block B — South Ridge (1.6 acres)',
        plantingDate: '2026-10-04',
        harvestDate: '',
        stage: 'growing',
        inputsUsed: 'DAP basal, foliar boron, mulching straw',
        inputCost: '620.00',
        expectedYieldKg: '2100.00',
        actualYieldKg: '0.00',
        notes: 'Flowering stage active; first pick scheduled early December.',
      },
    ]);

    await tx.insert(piggeryRecords).values([
      {
        sectorId: secId('piggery'),
        projectId: prjId('PRJ-PG-01'),
        batchCode: 'PG-2026-A',
        category: 'sows',
        headCount: 14,
        birthsCount: 28,
        purchasesCount: 12,
        salesCount: 0,
        feedPlan: 'Lactation Concentrate 3.2 kg/head/day',
        feedCost: '1120.00',
        operatingCost: '410.00',
        salesRevenue: '0.00',
        healthStatus: 'healthy',
        recordDate: '2026-11-10',
        notes: '3 sows farrowed cleanly; iron supplementation completed at day 3.',
      },
      {
        sectorId: secId('piggery'),
        projectId: prjId('PRJ-PG-01'),
        batchCode: 'PG-2026-B',
        category: 'growers',
        headCount: 22,
        birthsCount: 0,
        purchasesCount: 0,
        salesCount: 14,
        feedPlan: 'Grower Finisher Pellets + Maize Bran Mix',
        feedCost: '1030.00',
        operatingCost: '290.00',
        salesRevenue: '3100.00',
        healthStatus: 'healthy',
        recordDate: '2026-11-12',
        notes: '14 finished porkers sold at avg 82 kg liveweight.',
      },
    ]);

    await tx.insert(poultryRecords).values([
      {
        sectorId: secId('poultry'),
        projectId: prjId('PRJ-PL-01'),
        flockCode: 'FLK-LYR-01',
        birdType: 'layers',
        birdCount: 1478,
        mortalityCount: 22,
        eggsCollected: 31500,
        feedUsedKg: '3840.00',
        feedCost: '2150.00',
        operatingCost: '330.00',
        salesRevenue: '4620.00',
        recordDate: '2026-11-10',
        notes: '81% average hen-day egg production; litter dry and well-ventilated.',
      },
      {
        sectorId: secId('poultry'),
        projectId: prjId('PRJ-PL-01'),
        flockCode: 'FLK-BRL-02',
        birdType: 'broilers',
        birdCount: 640,
        mortalityCount: 9,
        eggsCollected: 0,
        feedUsedKg: '1180.00',
        feedCost: '890.00',
        operatingCost: '165.00',
        salesRevenue: '0.00',
        recordDate: '2026-11-17',
        notes: 'Week 4 finisher transition; target harvest weight 2.1 kg at Day 42.',
      },
    ]);

    await tx.insert(verticalFarmingRecords).values([
      {
        sectorId: secId('vertical_farming'),
        projectId: prjId('PRJ-VF-01'),
        systemName: 'NFT Rack Array A',
        systemType: 'NFT Hydroponics',
        cropVariety: 'Butterhead Lettuce',
        cycleNumber: 4,
        cycleStage: 'completed',
        nutrientPh: '5.90',
        ecLevel: '1.65',
        inputsNote: 'Calcium nitrate + potassium phosphate A/B blend',
        operatingCost: '410.00',
        yieldKg: '195.00',
        recordDate: '2026-11-15',
        },
      {
        sectorId: secId('vertical_farming'),
        projectId: prjId('PRJ-VF-01'),
        systemName: 'Aeroponic Tower Bank B',
        systemType: 'Aeroponics',
        cropVariety: 'Sweet Genovese Basil',
        cycleNumber: 5,
        cycleStage: 'vegetative',
        nutrientPh: '6.10',
        ecLevel: '1.95',
        inputsNote: '14-hour LED photoperiod, mist cycle 45s/4m',
        operatingCost: '280.00',
        yieldKg: '84.00',
        recordDate: '2026-11-19',
      },
    ]);

    await tx.insert(auditLogs).values([
      {
        actorEmail: 'system@genzagririse.org',
        actorRole: 'founder',
        action: 'ORG_BOOTSTRAP',
        entityType: 'organisation',
        entityId: 'genz-agririse',
        summary: 'Initialised 4 sectors, 5 RBAC roles, 14 permission keys, and baseline ledger records.',
        metadataJson: JSON.stringify({ txSeeded: txRows.length }),
      },
    ]);
  });
}

export async function ensureSeeded(): Promise<void> {
  if (!seedPromise) {
    seedPromise = runSeed().catch((err) => {
      seedPromise = null;
      throw err;
    });
  }
  await seedPromise;
}
