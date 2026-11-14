// Repo field_audit (bảng dùng chung – db/schema/shared.ts) chạy trên transaction của uow gọi nó: declaration, catalog, integration
// gắn vào repos của mình để dòng audit commit/rollback cùng lệnh sửa (bất biến 6).
import { and, desc, eq } from "drizzle-orm";
import type { FieldAuditRecord, FieldAuditRepo } from "../shared/audit.js";
import { monotonicFactory } from "ulid";
import type { Tx } from "./client.js";
import { fieldAudit } from "./schema/shared.js";

/** ulid tăng dần kể cả cùng mili giây – nhiều ô trong một lần sửa giữ đúng thứ tự (lịch sử sắp at DESC, id DESC). */
const nextUlid = monotonicFactory();

export function drizzleFieldAudit(tx: Tx): FieldAuditRepo {
  return {
    append: async (ctx, at, entries) => {
      if (!entries.length) return;
      await tx.insert(fieldAudit).values(
        entries.map((e) => ({ id: `fld_${nextUlid()}`, orgId: ctx.orgId, dossierId: e.dossierId, fieldId: null, documentId: null, key: e.key, oldValue: e.oldValue, newValue: e.newValue, userId: ctx.userId, source: e.source, at })),
      );
    },
    listForObject: async (orgId, objectId, source, limit) =>
      (await tx.select().from(fieldAudit).where(and(eq(fieldAudit.orgId, orgId), eq(fieldAudit.dossierId, objectId), eq(fieldAudit.source, source))).orderBy(desc(fieldAudit.at), desc(fieldAudit.id)).limit(limit)).map(
        (r): FieldAuditRecord => ({ id: r.id, orgId: r.orgId, dossierId: r.dossierId, key: r.key, oldValue: r.oldValue, newValue: r.newValue, source: r.source as FieldAuditRecord["source"], userId: r.userId, at: r.at }),
      ),
  };
}
