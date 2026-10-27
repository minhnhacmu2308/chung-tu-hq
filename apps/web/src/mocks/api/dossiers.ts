// Hồ sơ khai báo (mock). Thay thân hàm bằng fetch tới backend khi có API – giữ nguyên chữ ký.
import { ApiError, mutate, newId, nowIso, query } from "@/lib/mock-request";
import { reasonApiError } from "@/mocks/reason-error";
import type { Direction, Dossier, DossierDocument, DossierStatus, StepId } from "@/mocks/types";
import type { MockDb } from "@/mocks/db";
import { customsSummaryOf } from "./customs";

/** Kèm trạng thái Hải quan gộp từ các tờ khai nhánh (như backend withCustoms) – vắng khi chưa truyền. */
const withCustoms = (db: MockDb, d: Dossier): Dossier => {
  const customs = customsSummaryOf(db, d.id);
  return customs ? { ...d, customs } : d;
};

export const dossierKeys = {
  all: ["dossiers"] as const,
  list: (f: DossierFilter) => ["dossiers", "list", f] as const,
  detail: (id: string) => ["dossiers", "detail", id] as const,
  documents: (id: string) => ["dossiers", "documents", id] as const,
};

export type DossierFilter = { direction?: Direction; status?: DossierStatus; step?: StepId; q?: string };

const matches = (f: DossierFilter) => (d: Dossier) => {
  const q = f.q?.trim().toLowerCase();
  return (!f.direction || d.direction === f.direction) && (!f.status || d.status === f.status) && (!f.step || d.step === f.step) && (!q || [d.code, d.partner, d.billNo].some((v) => v.toLowerCase().includes(q)));
};

export const listDossiers = (f: DossierFilter = {}) => query((db) => db.dossiers.filter(matches(f)).map((d) => withCustoms(db, d)));
/** Cùng hình dạng với API phân trang server: {items,total,limit,offset}. */
export const listDossiersPage = (f: DossierFilter, page: { limit: number; offset: number }) =>
  query((db) => {
    const all = db.dossiers.filter(matches(f));
    return { items: all.slice(page.offset, page.offset + page.limit).map((d) => withCustoms(db, d)), total: all.length, limit: page.limit, offset: page.offset };
  });

export const getDossier = (id: string) =>
  query((db) => {
    const d = db.dossiers.find((x) => x.id === id);
    if (!d) throw new ApiError("NOT_FOUND", "Không tìm thấy hồ sơ");
    return withCustoms(db, d);
  });

export const listDocuments = (dossierId: string) => query((db) => db.documents.filter((d) => d.dossierId === dossierId));

import type { CreateDossierInput } from "@kb/contracts";
export type { CreateDossierInput };

export const createDossier = (input: CreateDossierInput) =>
  mutate((db) => {
    // Như backend: hết hồ sơ của gói trong tháng → QUOTA_EXCEEDED.
    const { plan, usage } = db.org;
    if (usage.dossiersThisMonth + 1 > plan.dossiersPerMonth + (plan.bonusThisMonth ?? 0)) throw new ApiError("QUOTA_EXCEEDED", "Đã dùng hết số hồ sơ của gói trong tháng này – nâng gói hoặc chờ tới ngày gia hạn để tạo thêm");
    db.org = { ...db.org, usage: { ...usage, dossiersThisMonth: usage.dossiersThisMonth + 1 } };
    const n = 100 + db.dossiers.length;
    const ym = new Date().toISOString().slice(2, 7).replace("-", "");
    const d: Dossier = {
      id: newId("dos"),
      code: `HS-${input.direction}-${ym}-${n}`,
      direction: input.direction,
      typeCode: input.typeCode,
      partner: input.partner.trim().toUpperCase(),
      customsOffice: input.customsOffice,
      skillSetId: input.skillSetId,
      status: "DRAFT",
      step: "upload",
      dueDate: input.dueDate,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      ownerId: db.currentUserId,
      invoiceValue: "0",
      currency: "USD",
      incoterm: input.incoterm,
      transportMode: input.transportMode,
      partyClass: input.partyClass,
      billNo: "",
      suspectFields: 0,
      ...(input.note ? { note: input.note } : {}),
    };
    db.dossiers.unshift(d);
    return d;
  });

export const updateDossier = (id: string, patch: Partial<Pick<Dossier, "status" | "step" | "suspectFields" | "note" | "declarationNo" | "channel">>) =>
  mutate((db) => {
    const d = db.dossiers.find((x) => x.id === id);
    if (!d) throw new ApiError("NOT_FOUND", "Không tìm thấy hồ sơ");
    Object.assign(d, patch, { updatedAt: nowIso() });
    return d;
  });

export const cancelDossier = (id: string) => updateDossier(id, { status: "CANCELLED" });

/** Xóa hẳn hồ sơ chưa truyền Hải quan (như backend deleteDossier): bỏ dữ liệu kèm theo, file hộp thư đã xếp vào hồ sơ trở lại "chờ xếp". */
export const deleteDossier = (id: string) =>
  mutate((db) => {
    const role = db.members.find((m) => m.id === db.currentUserId)?.role;
    if (role !== "OWNER" && role !== "ADMIN" && role !== "APPROVER") throw new ApiError("FORBIDDEN", "Cần vai trò APPROVER/ADMIN", 403);
    const d = db.dossiers.find((x) => x.id === id);
    if (!d) throw new ApiError("NOT_FOUND", "Không tìm thấy hồ sơ");
    if (d.status === "SUBMITTED" || d.status === "CLEARED" || d.declarationNo || customsSummaryOf(db, id) || db.customsFlows[id]) throw reasonApiError("INVALID_STATE", "DOSSIER_SENT_TO_CUSTOMS");
    const docIds = new Set(db.documents.filter((x) => x.dossierId === id).map((x) => x.id));
    db.dossiers = db.dossiers.filter((x) => x.id !== id);
    db.documents = db.documents.filter((x) => x.dossierId !== id);
    db.fields = db.fields.filter((x) => !docIds.has(x.documentId));
    db.checks = db.checks.filter((x) => x.dossierId !== id);
    db.lineItems = db.lineItems.filter((x) => x.dossierId !== id);
    db.agentRuns = db.agentRuns.filter((x) => x.dossierId !== id);
    db.declarations = db.declarations.filter((x) => x.dossierId !== id);
    delete db.valueCharges[id];
    for (const m of db.inboxMessages) {
      let released = false;
      for (const a of m.attachments) if (a.dossierId === id) Object.assign(a, { status: "PENDING", dossierId: null, dossierCode: null }), (released = true);
      if (released && m.status === "DONE") m.status = "NEW";
    }
    return { id, code: d.code };
  });

export type { Dossier, DossierDocument };
