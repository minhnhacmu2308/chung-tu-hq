import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, numeric, pgPolicy, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { organizations } from "./identity.js";
import { appRole, id, orgId, orgPolicyUsing, orgRls, timestamps } from "./shared.js";

/** Skill mẫu (is_template, thuộc org hệ thống) được mọi org đọc để sao chép; ghi/sửa/xóa chỉ dòng của org mình. */
const templateReadable = (name: string) => [
  pgPolicy(`${name}_read`, { for: "select", to: appRole, using: sql`${orgPolicyUsing} OR is_template = true` }),
  pgPolicy(`${name}_insert`, { for: "insert", to: appRole, withCheck: orgPolicyUsing }),
  pgPolicy(`${name}_update`, { for: "update", to: appRole, using: orgPolicyUsing, withCheck: orgPolicyUsing }),
  pgPolicy(`${name}_delete`, { for: "delete", to: appRole, using: orgPolicyUsing }),
];

/** Skill AI: cách đọc một loại chứng từ (trường, alias, ví dụ) hoặc ánh xạ tờ khai. Skill mẫu thuộc org hệ thống (is_template). */
export const skills = pgTable(
  "skills",
  {
    id: id(),
    orgId: orgId().references(() => organizations.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    kind: text("kind").notNull(),
    docKind: text("doc_kind"),
    supplier: text("supplier"),
    language: text("language").notNull().default("Đa ngôn ngữ"),
    enabled: boolean("enabled").notNull().default(true),
    isTemplate: boolean("is_template").notNull().default(false),
    templateId: text("template_id"),
    currentVersion: integer("current_version").notNull().default(1),
    labeledSamples: integer("labeled_samples").notNull().default(0),
    accuracy: numeric("accuracy", { precision: 6, scale: 4 }),
    ...timestamps(),
  },
  (t) => [uniqueIndex("skills_org_code_uq").on(t.orgId, t.code), index("skills_org_kind_idx").on(t.orgId, t.kind), ...templateReadable("skills")],
).enableRLS();

export const skillVersions = pgTable(
  "skill_versions",
  {
    id: id(),
    orgId: orgId(),
    skillId: text("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    fields: jsonb("fields").notNull(),
    promptNotes: text("prompt_notes"),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("skill_versions_skill_version_uq").on(t.skillId, t.version),
    pgPolicy("skill_versions_read", { for: "select", to: appRole, using: sql`${orgPolicyUsing} OR skill_id IN (select id from skills where is_template = true)` }),
    pgPolicy("skill_versions_insert", { for: "insert", to: appRole, withCheck: orgPolicyUsing }),
  ],
).enableRLS();

export const skillSamples = pgTable(
  "skill_samples",
  {
    id: id(),
    orgId: orgId(),
    skillId: text("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    documentId: text("document_id"),
    storageKey: text("storage_key").notNull(),
    fileName: text("file_name").notNull(),
    pages: integer("pages").notNull().default(1),
    sizeBytes: integer("size_bytes").notNull().default(0),
    status: text("status").notNull().default("PENDING"),
    expected: jsonb("expected"),
    labeledBy: text("labeled_by"),
    labeledAt: timestamp("labeled_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [index("skill_samples_skill_idx").on(t.skillId), orgRls("skill_samples_rls")],
).enableRLS();

export const skillEvaluations = pgTable(
  "skill_evaluations",
  {
    id: id(),
    orgId: orgId(),
    skillId: text("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    accuracy: numeric("accuracy", { precision: 6, scale: 4 }).notNull(),
    previousAccuracy: numeric("previous_accuracy", { precision: 6, scale: 4 }),
    perField: jsonb("per_field").notNull(),
    samples: integer("samples").notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("skill_evaluations_skill_idx").on(t.skillId, t.finishedAt), orgRls("skill_evaluations_rls")],
).enableRLS();
