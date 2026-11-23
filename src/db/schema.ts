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
  accountOwnerId: uuid("account_owner_id").references(() => users.id),
  statusOptionId: uuid("status_option_id"),
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

// REVs (service lines) worked on each engagement. One row per REV.
export const engagementRevs = pgTable("engagement_revs", {
  engagementId: uuid("engagement_id").references(() => engagements.id, { onDelete: "cascade" }).notNull(),
  rev: text("rev").notNull(),
  frameworkAppliedAt: timestamp("framework_applied_at", { withTimezone: true }),
  addedBy: uuid("added_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.engagementId, t.rev] })]);

// The standard framework for each REV: milestones and the tasks that lead to each one, in order.
// Loaded by an admin from the frameworks spreadsheet.
export const frameworkSteps = pgTable("framework_steps", {
  id: uuid("id").primaryKey().defaultRandom(),
  rev: text("rev").notNull(),
  sortOrder: integer("sort_order").notNull(),
  kind: text("kind").notNull(), // milestone | task
  number: text("number"),
  title: text("title").notNull(),
  durationWeeks: integer("duration_weeks").notNull().default(1),
  repeats: text("repeats"),
  ownerRole: text("owner_role"),
  clientInput: text("client_input"),
  output: text("output"),
  uploadedBy: uuid("uploaded_by").references(() => users.id),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("framework_steps_rev").on(t.rev, t.sortOrder)]);

// Board-specific dropdown options (Graphic Design board): contractors (a person + color) and statuses (label + color).
export const boardOptions = pgTable("board_options", {
  id: uuid("id").primaryKey().defaultRandom(),
  engagementId: uuid("engagement_id").references(() => engagements.id, { onDelete: "cascade" }).notNull(),
  field: text("field").notNull(), // contractor | status
  label: text("label").notNull(),
  color: text("color"),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("board_options_eng").on(t.engagementId, t.field)]);

// Branding Templates tab: one row per client with free-text notes (links to brand assets and templates).
export const brandClients = pgTable("brand_clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  engagementId: uuid("engagement_id").references(() => engagements.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  notes: text("notes"),
  isPast: boolean("is_past").notNull().default(false),
  updatedBy: uuid("updated_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// Notes tab on engagements and partners: blockers, dependencies, meeting notes and plain notes.
// visibility "private" = only the author sees it (admins included).
export const projectNotes = pgTable("project_notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  engagementId: uuid("engagement_id").references(() => engagements.id, { onDelete: "cascade" }).notNull(),
  authorId: uuid("author_id").references(() => users.id).notNull(),
  kind: text("kind").notNull(), // blocker | dependency | meeting | note
  title: text("title").notNull(),
  body: text("body"),
  visibility: text("visibility").notNull().default("team"), // team | private
  waitingOn: text("waiting_on"), // client | internal | vendor | other
  ownerId: uuid("owner_id").references(() => users.id),
  neededBy: date("needed_by"),
  status: text("status").notNull().default("open"), // open | resolved
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolvedBy: uuid("resolved_by").references(() => users.id),
  meetingDate: date("meeting_date"),
  attendees: text("attendees"),
  recordingUrl: text("recording_url"),
  mentions: uuid("mentions").array().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("project_notes_eng").on(t.engagementId, t.createdAt)]);

/** Plan tasks a blocker or dependency holds up. */
export const projectNoteTasks = pgTable("project_note_tasks", {
  noteId: uuid("note_id").references(() => projectNotes.id, { onDelete: "cascade" }).notNull(),
  taskId: uuid("task_id").references(() => tasks.id, { onDelete: "cascade" }).notNull(),
}, (t) => [primaryKey({ columns: [t.noteId, t.taskId] })]);

/** Replies on a note. They follow the note's visibility. */
export const projectNoteReplies = pgTable("project_note_replies", {
  id: uuid("id").primaryKey().defaultRandom(),
  noteId: uuid("note_id").references(() => projectNotes.id, { onDelete: "cascade" }).notNull(),
  authorId: uuid("author_id").references(() => users.id).notNull(),
  body: text("body").notNull(),
  mentions: uuid("mentions").array().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** The client's recent meetings and emails, sent by the scheduled Aurasell sync. One row per engagement, replaced on every sync. */
export type StoredPerson = { name: string; email?: string; client: boolean };
export type StoredMeeting = { id: string; title: string; start: string; end?: string | null; link?: string | null; people?: StoredPerson[]; summary?: string | null; has_recording?: boolean; heat?: string | null };
export type StoredEmail = { id: string; title: string; at: string; from?: StoredPerson | null; to?: StoredPerson[]; snippet?: string | null };
export const clientActivity = pgTable("client_activity", {
  engagementId: uuid("engagement_id").primaryKey().references(() => engagements.id, { onDelete: "cascade" }),
  accountName: text("account_name"),
  meetings: jsonb("meetings").$type<StoredMeeting[]>().default([]).notNull(),
  emails: jsonb("emails").$type<StoredEmail[]>().default([]).notNull(),
  syncedAt: timestamp("synced_at", { withTimezone: true }).defaultNow().notNull(),
});

// Sign-in for AI connectors (ChatGPT, Claude): OAuth 2.1 with PKCE. Each person signs in with their own account.
export const oauthClients = pgTable("oauth_clients", {
  id: text("id").primaryKey(), // client_id
  name: text("name"),
  redirectUris: text("redirect_uris").array().notNull(),
  authMethod: text("auth_method").notNull().default("none"), // none | client_secret_post | client_secret_basic
  secretHash: text("secret_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
export const oauthCodes = pgTable("oauth_codes", {
  codeHash: text("code_hash").primaryKey(),
  clientId: text("client_id").notNull(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  redirectUri: text("redirect_uri").notNull(),
  codeChallenge: text("code_challenge").notNull(),
  scope: text("scope"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
});
export const oauthTokens = pgTable("oauth_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  accessHash: text("access_hash").notNull().unique(),
  refreshHash: text("refresh_hash").notNull().unique(),
  clientId: text("client_id").notNull(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  accessExpiresAt: timestamp("access_expires_at", { withTimezone: true }).notNull(),
  refreshExpiresAt: timestamp("refresh_expires_at", { withTimezone: true }).notNull(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
