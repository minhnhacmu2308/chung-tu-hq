import type { Role } from "@kb/contracts";
import type { Ctx } from "../../../../shared/ctx.js";
import { fixedClock } from "../../../../shared/clock.js";
import { asOrgId, asUserId, sequentialIdGen } from "../../../../shared/ids.js";
import { RecordingOrgAudit } from "../../../../shared/audit.js";
import { InMemoryJobQueue } from "../../../../shared/queue.js";
import type { CatalogDeps, CatalogDocumentLine, CodeSetRow, ItemAliasRow } from "../ports.js";
import { InMemoryCatalogUow } from "../test/in-memory-catalog-uow.js";

export const ORG = asOrgId("org_a");
export const OTHER = asOrgId("org_b");
export const NOW = new Date("2026-11-13T03:00:00Z");

export const ctxOf = (role: Role, userId = `usr_${role.toLowerCase()}`, orgId = ORG): Ctx => ({ orgId, userId: asUserId(userId), role });
export const admin = ctxOf("ADMIN");
export const owner = ctxOf("OWNER");
export const approver = ctxOf("APPROVER");
export const declarant = ctxOf("DECLARANT");
export const viewer = ctxOf("VIEWER");
export const otherAdmin = ctxOf("ADMIN", "usr_x", OTHER);

export type AuditRec = { orgId: string; dossierId: string; key: string; oldValue: string; newValue: string; source: string };

export function makeHarness() {
  const uow = new InMemoryCatalogUow();
  const audits: AuditRec[] = [];
  /** Như bảng field_audit: kèm người sửa + thời điểm (cho getItemHistory). */
  const auditLog: (AuditRec & { userId: string; at: Date })[] = [];
  const orgAudit = new RecordingOrgAudit();
  const jobs = new InMemoryJobQueue();
  /** Dòng hàng từ chứng từ (giả) – test đặt trước khi gọi importFromDocuments. */
  const docs = { declarations: [] as CatalogDocumentLine[], invoices: [] as CatalogDocumentLine[] };
  const deps: CatalogDeps = {
    uow,
    audit: {
      append: async (c, r) => {
        audits.push({ orgId: c.orgId, ...r });
        auditLog.push({ orgId: c.orgId, ...r, userId: c.userId, at: NOW });
      },
      list: async (c, itemId, limit) =>
        auditLog.filter((a) => a.orgId === c.orgId && a.dossierId === itemId && a.source === "CATALOG_EDIT").reverse().slice(0, limit)
          .map((a) => ({ key: a.key, oldValue: a.oldValue, newValue: a.newValue, userId: a.userId, at: a.at })),
    },
    // Người xem / người lạ không được làm người phụ trách.
    members: { eligibleOwners: async (_o, ids) => new Set(ids.filter((i) => i !== "usr_viewer" && i !== "usr_stranger")) },
    orgAudit,
    jobs,
    documents: { approvedDeclarationLines: async () => docs.declarations, invoiceLines: async () => docs.invoices },
    clock: fixedClock(NOW.toISOString()),
    idGen: sequentialIdGen(),
  };
  return { uow, deps, audits, orgAudit, jobs, docs };
}
export type Harness = ReturnType<typeof makeHarness>;

/** Bộ mã có sẵn (vd bộ XNK mặc định do migration tạo). */
export function seedSet(h: Harness, row: Partial<CodeSetRow> & { id: string; kind: CodeSetRow["kind"] }, orgId: string = ORG) {
  h.uow.data.codeSets.push({ orgId, name: row.kind, partnerName: null, partnerKey: null, isPrimaryDisplay: false, isDefault: false, createdAt: NOW, updatedAt: NOW, ...row });
}
export function seedOwner(h: Harness, codeSetId: string, userId: string, orgId: string = ORG) {
  h.uow.data.owners.push({ codeSetId, userId, orgId });
}
export function seedAlias(h: Harness, row: Partial<ItemAliasRow> & { id: string; codeSetId: string; code: string; codeKey: string; itemId: string }, orgId: string = ORG) {
  h.uow.data.aliases.push({ orgId, name: null, unit: null, status: "ACTIVE", proposedBy: null, decidedBy: null, decidedAt: NOW, source: "MIGRATION", createdAt: NOW, updatedAt: NOW, ...row });
}
