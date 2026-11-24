import { relations } from 'drizzle-orm';
import {
  boolean,
  integer,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  displayName: text('display_name').notNull().default(''),
  photoUrl: text('photo_url').notNull().default(''),
  globalRoleSlug: text('global_role_slug').notNull().default('member'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const roles = pgTable('roles', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  rank: integer('rank').notNull().default(10),
  isSystem: boolean('is_system').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const permissions = pgTable('permissions', {
  id: serial('id').primaryKey(),
  key: text('key').notNull().unique(),
  label: text('label').notNull(),
  module: text('module').notNull(),
  description: text('description').notNull(),
});

export const rolePermissions = pgTable(
  'role_permissions',
  {
    id: serial('id').primaryKey(),
    roleId: integer('role_id')
      .references(() => roles.id, { onDelete: 'cascade' })
      .notNull(),
    permissionId: integer('permission_id')
      .references(() => permissions.id, { onDelete: 'cascade' })
      .notNull(),
  },
  (table) => [
    uniqueIndex('role_permissions_role_perm_idx').on(
      table.roleId,
      table.permissionId
    ),
  ]
);

export const sectors = pgTable('sectors', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  focusArea: text('focus_area').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const members = pgTable('members', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  memberCode: text('member_code').notNull().unique(),
  fullName: text('full_name').notNull(),
  email: text('email').notNull().unique(),
  phone: text('phone').notNull(),
  location: text('location').notNull().default('Central Hub'),
  dateJoined: text('date_joined').notNull(),
  status: text('status').notNull().default('active'),
  contributionRequired: numeric('contribution_required', {
    precision: 14,
    scale: 2,
  })
    .notNull()
    .default('0.00'),
  notes: text('notes').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const memberSectorRoles = pgTable(
  'member_sector_roles',
  {
    id: serial('id').primaryKey(),
    memberId: integer('member_id')
      .references(() => members.id, { onDelete: 'cascade' })
      .notNull(),
    sectorId: integer('sector_id')
      .references(() => sectors.id, { onDelete: 'cascade' })
      .notNull(),
    roleId: integer('role_id')
      .references(() => roles.id, { onDelete: 'restrict' })
      .notNull(),
    isPrimary: boolean('is_primary').notNull().default(false),
    assignedAt: timestamp('assigned_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('member_sector_unique_idx').on(table.memberId, table.sectorId),
  ]
);

export const projects = pgTable('projects', {
  id: serial('id').primaryKey(),
  sectorId: integer('sector_id')
    .references(() => sectors.id, { onDelete: 'restrict' })
    .notNull(),
  managerMemberId: integer('manager_member_id').references(() => members.id, {
    onDelete: 'set null',
  }),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  budget: numeric('budget', { precision: 14, scale: 2 })
    .notNull()
    .default('0.00'),
  status: text('status').notNull().default('active'),
  startDate: text('start_date').notNull(),
  targetEndDate: text('target_end_date').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const projectProgressLogs = pgTable('project_progress_logs', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id')
    .references(() => projects.id, { onDelete: 'cascade' })
    .notNull(),
  milestonePct: integer('milestone_pct').notNull().default(0),
  summary: text('summary').notNull(),
  logDate: text('log_date').notNull(),
  loggedByUserId: integer('logged_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const financialTransactions = pgTable('financial_transactions', {
  id: serial('id').primaryKey(),
  reference: text('reference').notNull().unique(),
  txType: text('tx_type').notNull(),
  amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
  txDate: text('tx_date').notNull(),
  description: text('description').notNull(),
  sectorId: integer('sector_id').references(() => sectors.id, {
    onDelete: 'set null',
  }),
  projectId: integer('project_id').references(() => projects.id, {
    onDelete: 'set null',
  }),
  memberId: integer('member_id').references(() => members.id, {
    onDelete: 'set null',
  }),
  counterparty: text('counterparty').notNull().default(''),
  recordedByUserId: integer('recorded_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  approvalStatus: text('approval_status').notNull().default('approved'),
  approvedByUserId: integer('approved_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  approvedAt: timestamp('approved_at'),
  rejectionReason: text('rejection_reason').notNull().default(''),
  reversedTransactionId: integer('reversed_transaction_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const memberPayments = pgTable('member_payments', {
  id: serial('id').primaryKey(),
  memberId: integer('member_id')
    .references(() => members.id, { onDelete: 'restrict' })
    .notNull(),
  transactionId: integer('transaction_id')
    .references(() => financialTransactions.id, { onDelete: 'restrict' })
    .notNull(),
  amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
  paymentDate: text('payment_date').notNull(),
  paymentMethod: text('payment_method').notNull(),
  reference: text('reference').notNull().unique(),
  notes: text('notes').notNull().default(''),
  recordedByUserId: integer('recorded_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const agricultureRecords = pgTable('ag_crop_cycles', {
  id: serial('id').primaryKey(),
  sectorId: integer('sector_id')
    .references(() => sectors.id, { onDelete: 'cascade' })
    .notNull(),
  projectId: integer('project_id').references(() => projects.id, {
    onDelete: 'set null',
  }),
  cropName: text('crop_name').notNull(),
  plotName: text('plot_name').notNull(),
  plantingDate: text('planting_date').notNull(),
  harvestDate: text('harvest_date').notNull().default(''),
  stage: text('stage').notNull().default('growing'),
  inputsUsed: text('inputs_used').notNull().default(''),
  inputCost: numeric('input_cost', { precision: 14, scale: 2 })
    .notNull()
    .default('0.00'),
  expectedYieldKg: numeric('expected_yield_kg', { precision: 12, scale: 2 })
    .notNull()
    .default('0.00'),
  actualYieldKg: numeric('actual_yield_kg', { precision: 12, scale: 2 })
    .notNull()
    .default('0.00'),
  notes: text('notes').notNull().default(''),
  recordedByUserId: integer('recorded_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const piggeryRecords = pgTable('piggery_batches', {
  id: serial('id').primaryKey(),
  sectorId: integer('sector_id')
    .references(() => sectors.id, { onDelete: 'cascade' })
    .notNull(),
  projectId: integer('project_id').references(() => projects.id, {
    onDelete: 'set null',
  }),
  batchCode: text('batch_code').notNull(),
  category: text('category').notNull(),
  headCount: integer('head_count').notNull().default(0),
  birthsCount: integer('births_count').notNull().default(0),
  purchasesCount: integer('purchases_count').notNull().default(0),
  salesCount: integer('sales_count').notNull().default(0),
  feedPlan: text('feed_plan').notNull().default(''),
  feedCost: numeric('feed_cost', { precision: 14, scale: 2 })
    .notNull()
    .default('0.00'),
  operatingCost: numeric('operating_cost', { precision: 14, scale: 2 })
    .notNull()
    .default('0.00'),
  salesRevenue: numeric('sales_revenue', { precision: 14, scale: 2 })
    .notNull()
    .default('0.00'),
  healthStatus: text('health_status').notNull().default('healthy'),
  recordDate: text('record_date').notNull(),
  notes: text('notes').notNull().default(''),
  recordedByUserId: integer('recorded_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const poultryRecords = pgTable('poultry_flocks', {
  id: serial('id').primaryKey(),
  sectorId: integer('sector_id')
    .references(() => sectors.id, { onDelete: 'cascade' })
    .notNull(),
  projectId: integer('project_id').references(() => projects.id, {
    onDelete: 'set null',
  }),
  flockCode: text('flock_code').notNull(),
  birdType: text('bird_type').notNull(),
  birdCount: integer('bird_count').notNull().default(0),
  mortalityCount: integer('mortality_count').notNull().default(0),
  eggsCollected: integer('eggs_collected').notNull().default(0),
  feedUsedKg: numeric('feed_used_kg', { precision: 10, scale: 2 })
    .notNull()
    .default('0.00'),
  feedCost: numeric('feed_cost', { precision: 14, scale: 2 })
    .notNull()
    .default('0.00'),
  operatingCost: numeric('operating_cost', { precision: 14, scale: 2 })
    .notNull()
    .default('0.00'),
  salesRevenue: numeric('sales_revenue', { precision: 14, scale: 2 })
    .notNull()
    .default('0.00'),
  recordDate: text('record_date').notNull(),
  notes: text('notes').notNull().default(''),
  recordedByUserId: integer('recorded_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const verticalFarmingRecords = pgTable('vf_systems', {
  id: serial('id').primaryKey(),
  sectorId: integer('sector_id')
    .references(() => sectors.id, { onDelete: 'cascade' })
    .notNull(),
  projectId: integer('project_id').references(() => projects.id, {
    onDelete: 'set null',
  }),
  systemName: text('system_name').notNull(),
  systemType: text('system_type').notNull(),
  cropVariety: text('crop_variety').notNull(),
  cycleNumber: integer('cycle_number').notNull().default(1),
  cycleStage: text('cycle_stage').notNull().default('vegetative'),
  nutrientPh: numeric('nutrient_ph', { precision: 4, scale: 2 })
    .notNull()
    .default('6.00'),
  ecLevel: numeric('ec_level', { precision: 5, scale: 2 })
    .notNull()
    .default('1.80'),
  inputsNote: text('inputs_note').notNull().default(''),
  operatingCost: numeric('operating_cost', { precision: 14, scale: 2 })
    .notNull()
    .default('0.00'),
  yieldKg: numeric('yield_kg', { precision: 12, scale: 2 })
    .notNull()
    .default('0.00'),
  recordDate: text('record_date').notNull(),
  recordedByUserId: integer('recorded_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const auditLogs = pgTable('audit_logs', {
  id: serial('id').primaryKey(),
  actorUserId: integer('actor_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  actorEmail: text('actor_email').notNull(),
  actorRole: text('actor_role').notNull(),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  sectorId: integer('sector_id').references(() => sectors.id, {
    onDelete: 'set null',
  }),
  summary: text('summary').notNull(),
  metadataJson: text('metadata_json').notNull().default('{}'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  recordedTransactions: many(financialTransactions),
  auditLogs: many(auditLogs),
}));

export const rolesRelations = relations(roles, ({ many }) => ({
  rolePermissions: many(rolePermissions),
  memberSectorRoles: many(memberSectorRoles),
}));

export const permissionsRelations = relations(permissions, ({ many }) => ({
  rolePermissions: many(rolePermissions),
}));

export const rolePermissionsRelations = relations(rolePermissions, ({ one }) => ({
  role: one(roles, {
    fields: [rolePermissions.roleId],
    references: [roles.id],
  }),
  permission: one(permissions, {
    fields: [rolePermissions.permissionId],
    references: [permissions.id],
  }),
}));

export const membersRelations = relations(members, ({ one, many }) => ({
  user: one(users, {
    fields: [members.userId],
    references: [users.id],
  }),
  sectorRoles: many(memberSectorRoles),
  payments: many(memberPayments),
}));

export const memberSectorRolesRelations = relations(
  memberSectorRoles,
  ({ one }) => ({
    member: one(members, {
      fields: [memberSectorRoles.memberId],
      references: [members.id],
    }),
    sector: one(sectors, {
      fields: [memberSectorRoles.sectorId],
      references: [sectors.id],
    }),
    role: one(roles, {
      fields: [memberSectorRoles.roleId],
      references: [roles.id],
    }),
  })
);

export const projectsRelations = relations(projects, ({ one, many }) => ({
  sector: one(sectors, {
    fields: [projects.sectorId],
    references: [sectors.id],
  }),
  manager: one(members, {
    fields: [projects.managerMemberId],
    references: [members.id],
  }),
  progressLogs: many(projectProgressLogs),
}));

export const projectProgressLogsRelations = relations(
  projectProgressLogs,
  ({ one }) => ({
    project: one(projects, {
      fields: [projectProgressLogs.projectId],
      references: [projects.id],
    }),
  })
);
