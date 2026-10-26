// Soạn bộ HYS (hồ sơ đính kèm điện tử) trước IDA/EDA: tạo/sửa/xóa bộ, thêm/bớt file, tổng quan + gợi ý. Gửi: send-hys.ts; worker: process-hys.ts.
import {
  checkHysSubmission, declarationFormValues, HYS_PROCEDURE_CODES, hysExtensionAllowed, isContentOperation, satisfiedHysCodes, suggestHys,
  type AttachmentValues, type CreateHysInput, type HysFileView, type HysOverview, type HysStatus, type HysSubmissionView, type UpdateHysInput,
} from "@kb/contracts";
import { requireRole, type Ctx } from "../../../shared/ctx.js";
import { domainError, reasonError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { buildFptRequest } from "../domain/declaration-to-fpt.js";
import { isLotEditable } from "../domain/lot-editable.js";
import { stageOf } from "../domain/state-machine.js";
import type { CustomsDeps, CustomsRepos, DeclarationSnapshot, HysFileRow, HysSubmissionRow, OutboxRow, ResultRow } from "./customs-ports.js";

const EDITABLE: readonly HysStatus[] = ["DRAFT", "REJECTED", "SEND_FAILED"];
/** Vai trò soạn/gửi bộ HYS (như khai IDA). */
export const HYS_ROLES = ["DECLARANT", "APPROVER", "ADMIN"] as const;
const firstToken = (v: string): string => v.split(/\s*[–-]\s*/)[0]!.trim();

/** Giá trị ô form của tờ khai (tên VNACCS) cho luật HYS; mã phân loại TK_EA* chuẩn hóa về mã ("A02 – …" → "A02"). */
export function hysValuesOf(snap: Pick<DeclarationSnapshot, "payload">): Record<string, string> {
  const { kind, fields } = snap.payload;
  const values: Record<string, string> = declarationFormValues(kind, Object.entries(fields).map(([code, f]) => ({ code, value: f.value })));
  for (const n of [1, 2, 3]) {
    const key = `TK_EA${n}`;
    if (values[key]) values[key] = firstToken(values[key]);
  }
  return values;
}

type Obj = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
/** TK_CH / TK_CHB mặc định: đúng cách cổng FPT lấy từ đầu tờ khai. */
function officeDefaults(snap: DeclarationSnapshot | null): { customsOffice: string | null; processingUnit: string | null } {
  if (!snap) return { customsOffice: null, processingUnit: null };
  const req = buildFptRequest(snap.payload).request as Obj;
  const head = (req[snap.payload.kind === "IDA" ? "objVN_IDA" : "objVN_EDA"] ?? {}) as Obj;
  return { customsOffice: str(head["tK_CH"]), processingUnit: str(head["tK_CHB"]) };
}

function toView(row: HysSubmissionRow, files: HysFileRow[]): HysSubmissionView {
  const fileViews: HysFileView[] = files.map((f) => ({ id: f.id, documentId: f.documentId, fileName: f.fileName, mime: f.mime, sizeBytes: f.sizeBytes, source: f.documentId ? "DOSSIER" : "UPLOAD" }));
  return {
    id: row.id, seq: row.seq, procedureCode: row.procedureCode, customsOffice: row.customsOffice, processingUnit: row.processingUnit, phone: row.phone ?? "", internalRef: row.internalRef ?? "", note: row.note,
    purpose: row.purpose, status: row.status, attempt: row.attempt, receiptNo: row.receiptNo, registeredOn: row.registeredOn, reject: row.reject, fill: row.fill, files: fileViews,
    issues: checkHysSubmission({ procedureCode: row.procedureCode, customsOffice: row.customsOffice, processingUnit: row.processingUnit, phone: row.phone, internalRef: row.internalRef, note: row.note, files: files.map((f) => ({ fileName: f.fileName, sizeBytes: f.sizeBytes })) }),
    sentAt: row.sentAt ? row.sentAt.toISOString() : null,
  };
}

export async function viewOf(r: CustomsRepos, orgId: string, id: string): Promise<HysSubmissionView> {
  const row = (await r.hys.get(orgId, id))!;
  return toView(row, await r.hys.files(orgId, id));
}

/** Bộ thuộc hồ sơ của org (org khác / hồ sơ khác → NOT_FOUND) và còn sửa được (cũng là điều kiện gửi: DRAFT/REJECTED/SEND_FAILED). */
export async function editable(r: CustomsRepos, orgId: string, dossierId: string, id: string): Promise<Result<HysSubmissionRow>> {
  const row = await r.hys.get(orgId, id);
  if (!row || row.dossierId !== dossierId) return err(domainError("NOT_FOUND", "Không tìm thấy bộ HYS"));
  if (!EDITABLE.includes(row.status)) return err(reasonError("INVALID_STATE", "HYS_NOT_EDITABLE"));
  return ok(row);
}

/** Lô còn sửa được (1.63/2.53 điền được) theo tờ khai hiện hành, kết quả các tờ và outbox của hồ sơ. */
export function lotEditableOf(snap: Pick<DeclarationSnapshot, "status"> | null, results: ResultRow[], outbox: OutboxRow[]): boolean {
  return isLotEditable({
    declarationStatus: snap?.status ?? null, stages: results.map(stageOf),
    contentPending: outbox.some((o) => o.status === "PENDING" && isContentOperation(o.operation)),
  });
}

/** Gợi ý HYS còn thiếu của tờ khai: số tiếp nhận đã vào 1.63/2.53 (bộ ACCEPTED điền được, hoặc nhập tay đủ cặp mã + số) thì không gợi ý. Dùng chung tổng quan và guard khai IDA/EDA. */
export function pendingHysSuggestions(snap: Pick<DeclarationSnapshot, "payload">, rows: Pick<HysSubmissionRow, "procedureCode" | "status" | "fill">[]): HysOverview["suggestions"] {
  const values = hysValuesOf(snap);
  const cells = Object.keys(values).filter((k) => /^CON_C\d+$/.test(k)).length;
  const satisfied = satisfiedHysCodes(values as AttachmentValues, rows.filter((x) => x.procedureCode !== null).map((x) => ({ procedureCode: x.procedureCode!, status: x.status, fill: x.fill })));
  return suggestHys({ kind: snap.payload.kind, values, containerCount: Math.max(snap.payload.containers.length, cells), satisfied });
}

const validProcedure = (code: string): boolean => code in HYS_PROCEDURE_CODES;

export async function getHysOverview(deps: CustomsDeps, ctx: Ctx, dossierId: string): Promise<Result<HysOverview>> {
  const dossier = await deps.dossiers.get(ctx.orgId, dossierId);
  if (!dossier) return err(domainError("NOT_FOUND", "Không tìm thấy hồ sơ"));
  const snap = await deps.declarations.get(ctx.orgId, dossierId);
  const { rows, files, results, outbox } = await deps.uow.asOrg(ctx, async (r) => ({
    rows: await r.hys.list(ctx.orgId, dossierId), files: await r.hys.filesForDossier(ctx.orgId, dossierId),
    results: await r.results.listForDossier(ctx.orgId, dossierId), outbox: await r.outbox.listForDossier(ctx.orgId, dossierId),
  }));
  const submissions = rows.map((row) => toView(row, files.filter((f) => f.submissionId === row.id)));
  const lotEditable = lotEditableOf(snap, results, outbox);
  const supplementHint = results.some((x) => stageOf(x) === "DECLARED" && (x.channel === "YELLOW" || x.channel === "RED"));
  let suggestions: HysOverview["suggestions"] = [];
  if (snap) {
    suggestions = pendingHysSuggestions(snap, rows);
  }
  return ok({ submissions, suggestions, lotEditable, supplementHint, defaults: { ...officeDefaults(snap), internalRef: dossier.code.slice(0, 20) } });
}

export async function createHysSubmission(deps: CustomsDeps, ctx: Ctx, dossierId: string, input: CreateHysInput): Promise<Result<HysSubmissionView>> {
  const allowed = requireRole(ctx, ...HYS_ROLES);
  if (!allowed.ok) return allowed;
  if (input.procedureCode !== undefined && !validProcedure(input.procedureCode)) return err(domainError("VALIDATION", `Mã thủ tục HYS không hợp lệ: ${input.procedureCode}`));
  const dossier = await deps.dossiers.get(ctx.orgId, dossierId);
  if (!dossier) return err(domainError("NOT_FOUND", "Không tìm thấy hồ sơ"));
  const snap = await deps.declarations.get(ctx.orgId, dossierId);
  const now = deps.clock.now();
  const defaults = officeDefaults(snap);
  const view = await deps.uow.asOrg(ctx, async (r) => {
    const seq = (await r.hys.list(ctx.orgId, dossierId)).reduce((m, x) => Math.max(m, x.seq), 0) + 1;
    const row: HysSubmissionRow = {
      id: deps.idGen.next("hys"), orgId: ctx.orgId, dossierId, seq, procedureCode: input.procedureCode ?? null, ...defaults, phone: null, internalRef: dossier.code.slice(0, 20), note: null,
      purpose: null, status: "DRAFT", attempt: 0, receiptNo: null, registeredOn: null, reject: null, fill: null, sentBy: null, sentAt: null, createdAt: now, updatedAt: now,
    };
    await r.hys.insert(row);
    return viewOf(r, ctx.orgId, row.id);
  });
  return ok(view);
}

export async function updateHysSubmission(deps: CustomsDeps, ctx: Ctx, dossierId: string, id: string, input: UpdateHysInput): Promise<Result<HysSubmissionView>> {
  const allowed = requireRole(ctx, ...HYS_ROLES);
  if (!allowed.ok) return allowed;
  if (input.procedureCode !== undefined && !validProcedure(input.procedureCode)) return err(domainError("VALIDATION", `Mã thủ tục HYS không hợp lệ: ${input.procedureCode}`));
  const dossier = await deps.dossiers.get(ctx.orgId, dossierId);
  if (!dossier) return err(domainError("NOT_FOUND", "Không tìm thấy hồ sơ"));
  const documentIds = input.documentIds === undefined ? undefined : [...new Set(input.documentIds)];
  const docs = documentIds ? await deps.dossiers.documents(ctx.orgId, dossierId) : [];
  const picked = documentIds?.map((d) => docs.find((x) => x.id === d));
  if (picked?.some((d) => !d)) return err(domainError("VALIDATION", "Chứng từ không thuộc hồ sơ"));
  const now = deps.clock.now();
  return deps.uow.asOrg(ctx, async (r) => {
    const cur = await editable(r, ctx.orgId, dossierId, id);
    if (!cur.ok) return cur;
    // Patch chỉ chứa khóa có giá trị (không truyền undefined).
    const patch: Partial<HysSubmissionRow> = { updatedAt: now };
    if (input.procedureCode !== undefined) patch.procedureCode = input.procedureCode;
    if (input.customsOffice !== undefined) patch.customsOffice = input.customsOffice;
    if (input.processingUnit !== undefined) patch.processingUnit = input.processingUnit;
    if (input.phone !== undefined) patch.phone = input.phone;
    if (input.internalRef !== undefined) patch.internalRef = input.internalRef;
    if (input.note !== undefined) patch.note = input.note;
    await r.hys.update(ctx.orgId, id, patch);
    if (picked) {
      const existing = await r.hys.files(ctx.orgId, id);
      for (const f of existing) if (f.documentId !== null) await r.hys.deleteFile(ctx.orgId, f.id);
      let position = existing.filter((f) => f.documentId === null).reduce((m, f) => Math.max(m, f.position), 0);
      for (const d of picked) {
        position += 1;
        await r.hys.insertFile({ id: deps.idGen.next("hysf"), orgId: ctx.orgId, submissionId: id, documentId: d!.id, storageKey: d!.storageKey, fileName: d!.fileName, mime: d!.mime, sizeBytes: d!.sizeBytes, position, createdAt: now });
      }
    }
    return ok(await viewOf(r, ctx.orgId, id));
  });
}

export async function deleteHysSubmission(deps: CustomsDeps, ctx: Ctx, dossierId: string, id: string): Promise<Result<void>> {
  const allowed = requireRole(ctx, ...HYS_ROLES);
  if (!allowed.ok) return allowed;
  return deps.uow.asOrg(ctx, async (r) => {
    const cur = await editable(r, ctx.orgId, dossierId, id);
    if (!cur.ok) return cur;
    for (const f of await r.hys.files(ctx.orgId, id)) if (f.documentId === null) await deps.dossiers.deleteFile(f.storageKey);
    await r.hys.delete(ctx.orgId, id);
    return ok(undefined);
  });
}

/** Phần tên trong khóa lưu: chỉ giữ [A-Za-z0-9._-], ký tự khác → `_`. */
const safeName = (name: string): string => name.replace(/[^A-Za-z0-9._-]/g, "_");

export async function addHysUploadedFiles(deps: CustomsDeps, ctx: Ctx, dossierId: string, id: string, files: { name: string; mime: string; bytes: Buffer }[]): Promise<Result<HysSubmissionView>> {
  const allowed = requireRole(ctx, ...HYS_ROLES);
  if (!allowed.ok) return allowed;
  const bad = files.filter((f) => !hysExtensionAllowed(f.name));
  if (bad.length) return err(domainError("VALIDATION", `Đuôi file không được HYS chấp nhận: ${bad.map((f) => f.name).join(", ")}`));
  const now = deps.clock.now();
  return deps.uow.asOrg(ctx, async (r) => {
    const cur = await editable(r, ctx.orgId, dossierId, id);
    if (!cur.ok) return cur;
    let position = (await r.hys.files(ctx.orgId, id)).reduce((m, f) => Math.max(m, f.position), 0);
    for (const f of files) {
      position += 1;
      const fileId = deps.idGen.next("hysf");
      const storageKey = `orgs/${ctx.orgId}/dossiers/${dossierId}/hys/${id}/${fileId}-${safeName(f.name)}`;
      await deps.dossiers.putFile(storageKey, f.bytes, f.mime);
      await r.hys.insertFile({ id: fileId, orgId: ctx.orgId, submissionId: id, documentId: null, storageKey, fileName: f.name, mime: f.mime, sizeBytes: f.bytes.length, position, createdAt: now });
    }
    await r.hys.update(ctx.orgId, id, { updatedAt: now });
    return ok(await viewOf(r, ctx.orgId, id));
  });
}

export async function removeHysFile(deps: CustomsDeps, ctx: Ctx, dossierId: string, id: string, fileId: string): Promise<Result<HysSubmissionView>> {
  const allowed = requireRole(ctx, ...HYS_ROLES);
  if (!allowed.ok) return allowed;
  const now = deps.clock.now();
  return deps.uow.asOrg(ctx, async (r) => {
    const cur = await editable(r, ctx.orgId, dossierId, id);
    if (!cur.ok) return cur;
    const file = (await r.hys.files(ctx.orgId, id)).find((f) => f.id === fileId);
    if (!file) return err(domainError("NOT_FOUND", "Không tìm thấy file trong bộ HYS"));
    if (file.documentId === null) await deps.dossiers.deleteFile(file.storageKey);
    await r.hys.deleteFile(ctx.orgId, fileId);
    await r.hys.update(ctx.orgId, id, { updatedAt: now });
    return ok(await viewOf(r, ctx.orgId, id));
  });
}
