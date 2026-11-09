import {
  pgTable, pgEnum, uuid, text, timestamp, date, boolean, integer, jsonb, primaryKey, index, bigserial,
} from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["admin", "member"]);
export const journeyStage = pgEnum("journey_stage", [
  "stage_0", "stage_1", "stage_2", "stage_3", "stage_4", "stage_5",
  "closed_won", "closed_lost", "kickoff", "in_delivery", "wrap_up", "complete", "on_hold",
]);
export const docCategory = pgEnum("doc_category", ["governance", "deliverable"]);
export const taskStatus = pgEnum("task_status", ["not_started", "in_progress", "blocked", "in_review", "done"]);
export const taskPriority = pgEnum("task_priority", ["low", "medium", "high", "urgent"]);
export const suggestionStatus = pgEnum("suggestion_status", ["pending", "accepted", "dismissed"]);
export const suggestionKind = pgEnum("suggestion_kind", ["task", "waiting_on_client", "milestone_estimate"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  avatarUrl: text("avatar_url"),
  title: text("title"),
  department: text("department"),
  role: userRole("role").notNull().default("member"),
  slackUserId: text("slack_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const clients = pgTable("clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  domain: text("domain"),
  logoUrl: text("logo_url"),
  aurasellAccountId: text("aurasell_account_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const engagements = pgTable("engagements", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  clientId: uuid("client_id").references(() => clients.id).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  serviceLine: text("service_line"),
  category: text("category").notNull().default("engagement"), // engagement | creative | partner
  journeyStage: journeyStage("journey_stage").notNull().default("stage_0"),
  health: text("health").default("on_track"), // on_track | at_risk | off_track
  leadUserId: uuid("lead_user_id").references(() => users.id),
  startDate: date("start_date"),
  endDate: date("end_date"),
  aurasellOpportunityId: text("aurasell_opportunity_id"),
  dealStageSyncedAt: timestamp("deal_stage_synced_at", { withTimezone: true }),
  driveFolderUrl: text("drive_folder_url"),
  slackInternalChannelId: text("slack_internal_channel_id"),
  slackExternalChannelId: text("slack_external_channel_id"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const engagementMembers = pgTable("engagement_members", {
  engagementId: uuid("engagement_id").references(() => engagements.id, { onDelete: "cascade" }).notNull(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  projectRole: text("project_role"),
  tags: text("tags").array().notNull().default([]),
}, (t) => [primaryKey({ columns: [t.engagementId, t.userId] })]);

export const clientContacts = pgTable("client_contacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  engagementId: uuid("engagement_id").references(() => engagements.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  title: text("title"),
  email: text("email"),
  linkedinUrl: text("linkedin_url"),
  roles: text("roles").array().notNull().default([]),
  notes: text("notes"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  engagementId: uuid("engagement_id").references(() => engagements.id, { onDelete: "cascade" }).notNull(),
  category: docCategory("category").notNull(),
  docType: text("doc_type"),
  title: text("title").notNull(),
  url: text("url").notNull(),
  source: text("source"), // Google Slides, Google Docs, PDF, Recording, Gmail, Other
  driveFileId: text("drive_file_id"),
  notes: text("notes"),
  status: text("status"),
  ownerId: uuid("owner_id").references(() => users.id),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const phases = pgTable("phases", {
  id: uuid("id").primaryKey().defaultRandom(),
  engagementId: uuid("engagement_id").references(() => engagements.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const tasks = pgTable("tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  engagementId: uuid("engagement_id").references(() => engagements.id, { onDelete: "cascade" }).notNull(),
  phaseId: uuid("phase_id").references(() => phases.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  description: text("description"),
  notes: text("notes"),
  ownerId: uuid("owner_id").references(() => users.id),
  status: taskStatus("status").notNull().default("not_started"),
  priority: taskPriority("priority").notNull().default("medium"),
  startDate: date("start_date"),
  dueDate: date("due_date"),
  isMilestone: boolean("is_milestone").notNull().default(false),
  waitingOnClient: boolean("waiting_on_client").notNull().default(false),
  sourceSuggestionId: uuid("source_suggestion_id"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  sortOrder: integer("sort_order").notNull().default(0),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("tasks_eng_due").on(t.engagementId, t.dueDate), index("tasks_owner_status").on(t.ownerId, t.status)]);

export const taskAssignees = pgTable("task_assignees", {
  taskId: uuid("task_id").references(() => tasks.id, { onDelete: "cascade" }).notNull(),
  userId: uuid("user_id").references(() => users.id).notNull(),
}, (t) => [primaryKey({ columns: [t.taskId, t.userId] })]);

export const taskDependencies = pgTable("task_dependencies", {
  taskId: uuid("task_id").references(() => tasks.id, { onDelete: "cascade" }).notNull(),
  dependsOnTaskId: uuid("depends_on_task_id").references(() => tasks.id, { onDelete: "cascade" }).notNull(),
}, (t) => [primaryKey({ columns: [t.taskId, t.dependsOnTaskId] })]);

export const taskLinks = pgTable("task_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  taskId: uuid("task_id").references(() => tasks.id, { onDelete: "cascade" }).notNull(),
  label: text("label").notNull(),
  url: text("url").notNull(),
  documentId: uuid("document_id").references(() => documents.id, { onDelete: "set null" }),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const userTaskPrefs = pgTable("user_task_prefs", {
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  taskId: uuid("task_id").references(() => tasks.id, { onDelete: "cascade" }).notNull(),
  myPriority: text("my_priority"), // top | high | medium | low
  pinned: boolean("pinned").notNull().default(false),
}, (t) => [primaryKey({ columns: [t.userId, t.taskId] })]);

export const comments = pgTable("comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  engagementId: uuid("engagement_id").references(() => engagements.id, { onDelete: "cascade" }).notNull(),
  taskId: uuid("task_id").references(() => tasks.id, { onDelete: "cascade" }),
  documentId: uuid("document_id").references(() => documents.id, { onDelete: "cascade" }),
  authorId: uuid("author_id").references(() => users.id).notNull(),
  body: text("body").notNull(),
  mentions: uuid("mentions").array().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const activityLog = pgTable("activity_log", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  engagementId: uuid("engagement_id").references(() => engagements.id, { onDelete: "cascade" }).notNull(),
  actorId: uuid("actor_id").references(() => users.id),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id"),
  action: text("action").notNull(),
  summary: text("summary").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Integrations
export const connections = pgTable("connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  scope: text("scope").notNull(), // company | user
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(), // aurasell | slack_app | gmail | slack_user | otter
  encryptedToken: text("encrypted_token"),
  encryptedRefreshToken: text("encrypted_refresh_token"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  status: text("status").notNull().default("active"),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const engagementSources = pgTable("engagement_sources", {
  engagementId: uuid("engagement_id").references(() => engagements.id, { onDelete: "cascade" }).notNull(),
  kind: text("kind").notNull(), // aurasell_account | email_domain | slack_channel
  value: text("value").notNull(),
}, (t) => [primaryKey({ columns: [t.engagementId, t.kind, t.value] })]);

export type SuggestionSource = {
  provider: "aurasell" | "gmail" | "slack" | "otter";
  url?: string;
  quote: string;
  speaker?: string;
  label: string; // e.g. "Rick · 30:44" or "Rick → Maria · Re: Pricing · Nov 6"
  at?: string;
  externalId: string;
};

export const suggestions = pgTable("suggestions", {
  id: uuid("id").primaryKey().defaultRandom(),
  engagementId: uuid("engagement_id").references(() => engagements.id, { onDelete: "cascade" }).notNull(),
  title: text("title").notNull(),
  kind: suggestionKind("kind").notNull().default("task"),
  ownerIds: uuid("owner_ids").array().notNull().default([]),
  externalOwner: text("external_owner"),
  dueDate: date("due_date"),
  dueText: text("due_text"),
  sources: jsonb("sources").$type<SuggestionSource[]>().notNull(),
  looksDoneEvidence: text("looks_done_evidence"),
  fingerprint: text("fingerprint").notNull(),
  status: suggestionStatus("status").notNull().default("pending"),
  taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
  decidedBy: uuid("decided_by").references(() => users.id),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("suggestions_eng_status").on(t.engagementId, t.status)]);

// Items already processed, so the pipeline never reads the same email/call twice
export const processedItems = pgTable("processed_items", {
  provider: text("provider").notNull(),
  externalId: text("external_id").notNull(),
  engagementId: uuid("engagement_id").references(() => engagements.id, { onDelete: "cascade" }).notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.provider, t.externalId, t.engagementId] })]);

// Personal tokens for the Claude tracker connector (MCP)
export const apiTokens = pgTable("api_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  label: text("label"),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
