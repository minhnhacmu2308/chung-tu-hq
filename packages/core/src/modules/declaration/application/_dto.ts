import type { AgentRunView, AgentTaskId, Declaration, DeclarationField, HsEntry, LineItem } from "@kb/contracts";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { mappingsFor } from "../domain/build.js";
import type { Shipment } from "@kb/contracts";
import type { AgentRunRow, DeclarationRepos, DeclarationRow, DossierInfo, HsCatalogRow, LineItemRow } from "./ports.js";
import type { DeclarationDeps } from "./ports.js";

export const TASK_ORDER: AgentTaskId[] = ["HS_LOOKUP", "MAPPING", "BUILD_DECLARATION", "DIGITIZE"];
export const TASKS_BY_MODE: Record<AgentRunRow["mode"], AgentTaskId[]> = { DECLARATION: ["HS_LOOKUP", "MAPPING", "BUILD_DECLARATION"], DIGITIZE: ["DIGITIZE"], BOTH: TASK_ORDER };

export function toLineItem(r: LineItemRow): LineItem {
  return {
    id: r.id, dossierId: r.dossierId, lineNo: r.lineNo, description: r.description, quantity: r.quantity, unit: r.unit, unitPrice: r.unitPrice, amount: r.amount, origin: r.origin,
    ...(r.invoiceHsCode ? { invoiceHsCode: r.invoiceHsCode } : {}),
    ...(r.hsSuggested ? { hsSuggested: r.hsSuggested } : {}),
    ...(r.hsConfidence !== null ? { hsConfidence: r.hsConfidence } : {}),
    ...(r.hsConfirmed ? { hsConfirmed: r.hsConfirmed } : {}),
    ...(r.importDutyRate !== null ? { importDutyRate: r.importDutyRate } : {}),
    ...(r.vatRate !== null ? { vatRate: r.vatRate } : {}),
    ...(r.policyNote ? { policyNote: r.policyNote } : {}),
  };
}

export function toHsEntry(h: HsCatalogRow): HsEntry {
  return { code: h.code, description: h.description, mfn: h.mfn, vat: h.vat, ...(Object.keys(h.pref).length ? { pref: h.pref } : {}), ...(h.policy ? { policy: h.policy } : {}) };
}

/** Thứ tự chỉ tiêu theo mapping (jsonb không giữ thứ tự key); chỉ tiêu USER sửa không có trong mapping vẫn giữ. */
export function toDeclaration(d: DeclarationRow, approvedByName: string | null): Declaration {
  const order = mappingsFor(d.kind).map((m) => m.code);
  const codes = [...order.filter((c) => c in d.fields), ...Object.keys(d.fields).filter((c) => !order.includes(c))];
  const fields: DeclarationField[] = codes.map((code) => {
    const f = d.fields[code]!;
    return { code, label: f.label, value: f.value, source: f.source, section: f.section, ...(f.no ? { no: f.no } : {}), ...(f.suspect ? { suspect: true } : {}), ...(f.note ? { note: f.note } : {}) };
  });
  return {
    dossierId: d.dossierId, kind: d.kind, status: d.status, fields, exchangeRate: d.exchangeRate, exchangeRateDate: d.exchangeRateDate, customsValueVnd: d.customsValueVnd,
    valueAdjustments: d.valueAdjustments.map((a) => ({ label: a.label, amount: a.amount, currency: a.currency, source: a.source })),
    estimatedImportDutyVnd: d.estImportDutyVnd, estimatedVatVnd: d.estVatVnd,
    ...(approvedByName ? { approvedBy: approvedByName } : {}),
    ...(d.approvedAt ? { approvedAt: d.approvedAt.toISOString() } : {}),
  };
}

export function toAgentRunView(r: AgentRunRow): AgentRunView {
  const selected = new Map(r.tasks.map((t) => [t.id, t]));
  const tasks = TASK_ORDER.map((id) => selected.get(id) ?? { id, status: "SKIPPED" as const, progress: 0, message: "Không chọn" });
  const current = r.tasks.find((t) => t.status === "RUNNING")?.id;
  const finished = r.status !== "RUNNING";
  return { run: { dossierId: r.dossierId, mode: r.mode, startedAt: r.startedAt.toISOString(), tasks }, logs: r.log, finished, ...(current ? { current } : {}) };
}

export async function loadDossier(deps: DeclarationDeps, orgId: string, dossierId: string): Promise<Result<DossierInfo>> {
  const d = await deps.dossiers.get(orgId, dossierId);
  return d ? ok(d) : err(domainError("NOT_FOUND", "Không tìm thấy hồ sơ"));
}

export const unconfirmedCount = (items: { hsConfirmed: string | null }[]) => items.filter((i) => !i.hsConfirmed).length;

export async function latestDraftOrNull(r: DeclarationRepos, orgId: string, dossierId: string) {
  return r.declarations.latest(orgId, dossierId);
}

/** Đồng bộ dòng hàng từ shipment.items (giữ HS đã xác nhận ở dòng cùng số thứ tự). */
export async function syncLineItems(deps: DeclarationDeps, r: DeclarationRepos, orgId: string, dossierId: string, shipment: Shipment): Promise<LineItemRow[]> {
  const now = deps.clock.now();
  const rows: LineItemRow[] = shipment.items.map((it) => ({
    id: deps.idGen.next("itm"), orgId, dossierId, lineNo: it.lineNo, description: it.description.value ?? "", quantity: it.quantity.value ?? "0", unit: it.unit.value ?? "PCE",
    unitPrice: it.unitPrice.value ?? "0", amount: it.amount.value ?? "0", origin: it.origin.value ?? "", invoiceHsCode: it.hsOnInvoice.value,
    hsSuggested: null, hsConfidence: null, hsConfirmed: null, hsConfirmedBy: null, hsConfirmedAt: null, importDutyRate: null, vatRate: null, policyNote: null, createdAt: now, updatedAt: now,
  }));
  return r.lineItems.upsertForDossier(dossierId, rows);
}

