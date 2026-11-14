import { sql } from "drizzle-orm";
import { index, numeric, pgPolicy, pgRole, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/** Role ứng dụng (tạo trong docker/postgres/init.sql và ensureAppRole). */
export const appRole = pgRole("kb_app").existing();

export const id = () => text("id").primaryKey();
export const orgId = () => text("org_id").notNull();
export const timestamps = () => ({
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
/** Tiền/trị giá: numeric(24,6); đọc/ghi dạng chuỗi. */
export const money = (name: string) => numeric(name, { precision: 24, scale: 6 });

/** Biểu thức policy: chỉ dòng của org đang đặt trong session. */
export const orgPolicyUsing = sql`org_id = current_setting('app.org_id', true)`;
/** Giá trị session hiện tại (NULL khi chưa set). */
export const currentOrg = sql`current_setting('app.org_id', true)`;
export const currentUser = sql`current_setting('app.user_id', true)`;
/** Không có ngữ cảnh (withSystem): chỉ identity dùng cho đăng nhập/đăng ký. */
export const noContext = sql`coalesce(current_setting('app.org_id', true), '') = '' and coalesce(current_setting('app.user_id', true), '') = ''`;

/** Policy chuẩn cho bảng nghiệp vụ theo org: đọc/ghi chỉ dòng của org đang đặt. */
export const orgRls = (name: string) => pgPolicy(name, { for: "all", to: appRole, using: orgPolicyUsing, withCheck: orgPolicyUsing });

/**
 * Nhật ký sửa trường – append-only: chỉ INSERT/SELECT (B6, bất biến 6). Bảng dùng chung (như org_audit): extraction, declaration, catalog, integration
 * ghi cùng transaction với lệnh sửa qua repo `fieldAudit` trong uow của chính module (src/db/field-audit.ts). `dossier_id` là khóa đối tượng
 * (hồ sơ; với danh mục = id mặt hàng), không FK.
 */
export const fieldAudit = pgTable(
  "field_audit",
  {
    id: id(),
    orgId: orgId(),
    dossierId: text("dossier_id").notNull(),
    fieldId: text("field_id"),
    documentId: text("document_id"),
    key: text("key").notNull(),
    oldValue: text("old_value").notNull().default(""),
    newValue: text("new_value").notNull().default(""),
    userId: text("user_id").notNull(),
    source: text("source").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("field_audit_org_dossier_idx").on(t.orgId, t.dossierId, t.at),
    pgPolicy("field_audit_select", { for: "select", to: appRole, using: orgPolicyUsing }),
    pgPolicy("field_audit_insert", { for: "insert", to: appRole, withCheck: sql`${orgPolicyUsing}` }),
  ],
).enableRLS();
