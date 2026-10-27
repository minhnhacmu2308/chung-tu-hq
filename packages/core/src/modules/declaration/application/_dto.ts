import { branchRanges, type AgentRunView, type AgentTaskId, type Declaration, type DeclarationBranch, type DeclarationField, type DeclarationItemView, type HsEntry, type LineItem, type LineItemHs } from "@kb/contracts";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { Decimal } from "../../../shared/decimal.js";
import { mappingsFor } from "../domain/build.js";
import type { DraftLessons, Shipment } from "@kb/contracts";
import { learnedDescription, learnedLinePlan, lineLessonFor } from "../domain/lessons-apply.js";
import type { AgentRunRow, DeclarationRepos, DeclarationRow, DossierInfo, HsCatalogRow, HsSuggestionRow, LineItemRow } from "./ports.js";
import type { DeclarationDeps } from "./ports.js";

export const TASK_ORDER: AgentTaskId[] = ["HS_LOOKUP", "MAPPING", "BUILD_DECLARATION", "DIGITIZE"];
export const TASKS_BY_MODE: Record<AgentRunRow["mode"], AgentTaskId[]> = { DECLARATION: ["HS_LOOKUP", "MAPPING", "BUILD_DECLARATION"], DIGITIZE: ["DIGITIZE"], BOTH: TASK_ORDER };

/** `sugs`: gợi ý HS của dòng (gợi ý chính đứng đầu theo tin cậy). Không truyền → không kèm khối `hs`. */
export function toLineItem(r: LineItemRow, sugs?: HsSuggestionRow[]): LineItem {
  return {
    id: r.id, dossierId: r.dossierId, lineNo: r.lineNo, description: r.description, quantity: r.quantity, unit: r.unit, unitPrice: r.unitPrice, amount: r.amount, origin: r.origin,
    ...(r.invoiceHsCode ? { invoiceHsCode: r.invoiceHsCode } : {}),
    ...(r.hsSuggested ? { hsSuggested: r.hsSuggested } : {}),
    ...(r.hsConfidence !== null ? { hsConfidence: r.hsConfidence } : {}),
    ...(r.hsConfirmed ? { hsConfirmed: r.hsConfirmed } : {}),
    ...(r.importDutyRate !== null ? { importDutyRate: r.importDutyRate } : {}),
    ...(r.vatRate !== null ? { vatRate: r.vatRate } : {}),
    ...(r.policyNote ? { policyNote: r.policyNote } : {}),
    ...(sugs ? { hs: toLineItemHs(r, sugs) } : {}),
  };
}

function toLineItemHs(r: LineItemRow, sugs: HsSuggestionRow[]): LineItemHs {
  const mine = sugs.filter((x) => x.lineItemId === r.id).sort((a, b) => (a.code === r.hsSuggested ? -1 : b.code === r.hsSuggested ? 1 : b.confidence - a.confidence));
  return {
    status: r.hsStatus, question: r.hsQuestion, error: r.hsError,
    reasoning: r.hsDetail?.reasoning ?? null, legalBasis: r.hsDetail?.legalBasis ?? [], warnings: r.hsDetail?.warnings ?? [],
    candidates: mine.map((x) => ({ code: x.code, description: x.description, confidence: x.confidence, whyNot: x.whyNot, importRate: x.rates?.importRate ?? null, basis: x.rates?.basis ?? null, agreement: x.rates?.agreement ?? null, vatRate: x.rates?.vatRate ?? null })),
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
    return { code, label: f.label, value: f.value, source: f.source, section: f.section, ...(f.no ? { no: f.no } : {}), ...(f.suspect ? { suspect: true } : {}), ...(f.note ? { note: f.note } : {}), ...(f.provenance ? { provenance: f.provenance } : {}), ...(f.condition ? { condition: f.condition } : {}) };
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

/**
 * Đồng bộ dòng hàng từ shipment.items (giữ HS đã xác nhận ở dòng cùng số thứ tự).
 * `lessons` (Dạy khai báo): mặt hàng đã học đủ số lần → mô tả tiếng Việt, mã HS + thuế suất đã khai (vẫn chờ người khai xác nhận HS); ít lần hơn → gợi ý mã.
 */
export async function syncLineItems(deps: DeclarationDeps, r: DeclarationRepos, orgId: string, dossierId: string, shipment: Shipment, lessons?: DraftLessons | null): Promise<LineItemRow[]> {
  const now = deps.clock.now();
  const lessonOf = (it: Shipment["items"][number]) => lineLessonFor(lessons, { partNo: it.partNo?.value ?? null, description: it.description.value });
  const rows: LineItemRow[] = shipment.items.map((it) => ({
    id: deps.idGen.next("itm"), orgId, dossierId, lineNo: it.lineNo, description: learnedDescription(lessonOf(it)) ?? it.description.value ?? "", quantity: it.quantity.value ?? "0", unit: it.unit.value ?? "PCE",
    unitPrice: it.unitPrice.value ?? "0", amount: it.amount.value ?? "0", origin: it.origin.value ?? "", invoiceHsCode: it.hsOnInvoice.value,
    hsSuggested: null, hsConfidence: null, hsConfirmed: null, hsConfirmedBy: null, hsConfirmedAt: null, importDutyRate: null, vatRate: null, policyNote: null,
    hsJobId: null, hsItemId: null, hsStatus: "idle", hsQuestion: null, hsError: null, hsDetail: null, createdAt: now, updatedAt: now,
  }));
  const saved = await r.lineItems.upsertForDossier(orgId, dossierId, rows);
  if (!lessons?.lines.length) return saved;
  const out: LineItemRow[] = [];
  for (const row of saved) {
    const it = shipment.items.find((x) => x.lineNo === row.lineNo);
    const plan = it ? learnedLinePlan(row, lessonOf(it)) : null;
    if (!plan) {
      out.push(row);
      continue;
    }
    const patch = { ...plan.patch, updatedAt: now };
    await r.lineItems.update(orgId, row.id, patch);
    if (plan.suggestion) {
      await r.suggestions.replaceForItem(orgId, row.id, [{ id: deps.idGen.next("sug"), orgId, lineItemId: row.id, code: plan.suggestion.code, description: plan.suggestion.description, confidence: 1, rates: plan.suggestion.rates, whyNot: null, source: "LESSON", createdAt: now }]);
    }
    out.push({ ...row, ...patch });
  }
  return out;
}


/** Tổng trị giá/thuế từng tờ khai nhánh (50 dòng/tờ theo lineNo), cộng bằng Decimal; không có dòng → một nhánh 0. */
type BranchItem = Pick<DeclarationItemView, "lineNo" | "amount" | "customsValueVnd" | "importDutyVnd" | "vatVnd">;
export function toBranches(items: BranchItem[]): DeclarationBranch[] {
  const sorted = [...items].sort((a, b) => a.lineNo - b.lineNo);
  const sum = (xs: BranchItem[], pick: (i: BranchItem) => string) => xs.reduce((a, i) => a.plus(pick(i)), new Decimal(0)).toFixed();
  return branchRanges(sorted.map((i) => i.lineNo)).map((r) => {
    const part = sorted.slice(r.index[0], r.index[1]);
    return { no: r.no, of: r.of, lineFrom: r.lineFrom, lineTo: r.lineTo, invoiceValue: sum(part, (i) => i.amount), customsValueVnd: sum(part, (i) => i.customsValueVnd), estImportDutyVnd: sum(part, (i) => i.importDutyVnd), estVatVnd: sum(part, (i) => i.vatVnd) };
  });
}
