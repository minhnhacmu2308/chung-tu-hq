// Qua khu vực giám sát (ADR 0014): màn xem + điều kiện chung của danh sách container (khai trước) và bảng kê KVGS (lấy sau thông quan).
import { containerListRequired, operationAvailability, operationsFor, type ContainerListRow, type CustomsOperation, type KvgsView, type Role } from "@kb/contracts";
import { requireRole, type Ctx } from "../../../shared/ctx.js";
import { domainError, reasonError, type DomainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { prefillContainerRows } from "../domain/container-prefill.js";
import { stageOf } from "../domain/state-machine.js";
import { availabilityInput, kvgsFlowOf } from "./_customs-view.js";
import type { ContainerListRecord, CustomsDeps, CustomsRepos, DeclarationSnapshot, DossierBrief, GatewayError, KvgsSheetRecord, ResultRow } from "./customs-ports.js";

/** Vi phạm ràng buộc duy nhất: Postgres 23505 (drizzle-orm bọc lỗi PG trong DrizzleQueryError, lỗi gốc ở .cause) hoặc thông điệp "duplicate key" (fake in-memory; không khớp rộng theo chữ "unique"). */
export function isDuplicate(e: unknown): boolean {
  let cur: unknown = e;
  for (let depth = 0; depth < 4 && cur != null; depth++) {
    if (typeof cur === "object" && (cur as { code?: unknown }).code === "23505") return true;
    if (/duplicate key/i.test(cur instanceof Error ? cur.message : typeof cur === "object" ? String((cur as { message?: unknown }).message ?? "") : String(cur))) return true;
    cur = typeof cur === "object" ? (cur as { cause?: unknown }).cause : null;
  }
  return false;
}

/** Vai trò khai/sửa/gửi; xem: mọi thành viên. */
export const KVGS_ROLES = ["DECLARANT", "APPROVER", "ADMIN"] as const satisfies readonly Role[];

const errorsOf = (e: GatewayError[] | null) => (e ?? []).map((x) => ({ code: x.code, message: x.message, ...(x.solution ? { solution: x.solution } : {}), ...(x.field ? { field: x.field } : {}), ...(x.line ? { line: x.line } : {}) }));

/** Điền sẵn từ chứng từ đã đọc; chưa nối nguồn chứng từ (hoặc đọc lỗi) → bảng rỗng. */
export async function prefillRows(deps: CustomsDeps, orgId: string, dossierId: string): Promise<ContainerListRow[]> {
  if (!deps.containerSources) return [];
  return prefillContainerRows(await deps.containerSources(orgId, dossierId));
}

export type KvgsScope = { dossier: DossierBrief; result: ResultRow | null; branch: number };

/** Hồ sơ + tờ khai nhánh (đọc hồ sơ/tờ khai TRƯỚC giao dịch – port module khác không gọi trong transaction); không có hồ sơ → NOT_FOUND. */
export async function preload(deps: CustomsDeps, ctx: Ctx, dossierId: string): Promise<Result<{ dossier: DossierBrief; snap: DeclarationSnapshot | null }>> {
  const dossier = await deps.dossiers.get(ctx.orgId, dossierId);
  if (!dossier) return err(domainError("NOT_FOUND", "Không tìm thấy hồ sơ"));
  return ok({ dossier, snap: await deps.declarations.get(ctx.orgId, dossierId) });
}

export async function loadScope(ctx: Ctx, dossier: DossierBrief, branch: number, r: CustomsRepos): Promise<Result<KvgsScope>> {
  const result = await r.results.get(ctx.orgId, dossier.id, branch);
  if (!result && branch !== 1) return err(domainError("NOT_FOUND", `Không có tờ khai ${branch}`));
  return ok({ dossier, result, branch });
}

/** Nghiệp vụ `op` (CONT_LIST/KVGS) làm được không theo giai đoạn tờ khai và trạng thái danh sách container; không → lý do (reason code). */
export async function checkOperation(r: CustomsRepos, ctx: Ctx, scope: KvgsScope, op: "CONT_LIST" | "KVGS"): Promise<DomainError | null> {
  const { dossier, result, branch } = scope;
  const outbox = (await r.outbox.listForDossier(ctx.orgId, dossier.id)).filter((o) => o.branch === branch);
  const flow = { direction: dossier.direction, approved: true, kvgs: await kvgsFlowOf(r, ctx.orgId, dossier, branch) };
  const a = operationAvailability(availabilityInput(flow, result, outbox)).find((x) => x.op === (op as CustomsOperation));
  if (!a) return domainError("VALIDATION", `Nghiệp vụ ${op} không thuộc luồng tờ khai`);
  if (a.enabled) return null;
  return a.reasonCode ? reasonError("INVALID_STATE", a.reasonCode, a.reasonParams) : domainError("INVALID_STATE", `Chưa thực hiện được ${op}`);
}

const listView = (l: ContainerListRecord): NonNullable<KvgsView["containerList"]> => ({
  attempt: l.attempt, status: l.status, rows: l.rows, refId: l.refId, receiptNo: l.receiptNo, receiptDate: l.receiptDate, errors: errorsOf(l.errors), sentAt: l.sentAt?.toISOString() ?? null,
});
const kvgsView = (k: KvgsSheetRecord): NonNullable<KvgsView["kvgs"]> => ({
  status: k.status, refId: k.refId, receiptNo: k.receiptNo, receiptDate: k.receiptDate, errors: errorsOf(k.errors), fetchedAt: k.fetchedAt?.toISOString() ?? null, sheet: k.sheet,
});

/** Mã cơ quan Hải quan ("03CE – HP" → "03CE"). */
export const officeCode = (v: string | undefined) => (v ?? "").split(/\s+[–-]\s+/)[0]?.trim() || null;

export async function buildView(ctx: Ctx, snap: DeclarationSnapshot | null, scope: KvgsScope, r: CustomsRepos, list: ContainerListRecord | null, preview: ContainerListRow[] | null): Promise<KvgsView> {
  const { dossier, result, branch } = scope;
  const kvgs = await r.kvgs.latest(ctx.orgId, dossier.id, branch);
  const required = containerListRequired(dossier.direction, dossier.transportMode);
  const fields = snap?.payload.fields ?? {};
  return {
    dossierId: dossier.id, branch,
    applies: { containerList: required, kvgs: operationsFor(dossier.direction).includes("KVGS") },
    containerList: list ? listView(list) : required && preview ? { attempt: 1, status: "DRAFT", rows: preview, refId: null, receiptNo: null, receiptDate: null, errors: [], sentAt: null } : null,
    kvgs: kvgs ? kvgsView(kvgs) : null,
    header: {
      declarationNo: result?.declarationNo ?? null, typeCode: dossier.typeCode || null, customsOffice: officeCode(fields["CQHQ"]?.value),
      registeredOn: result?.raw?.customsInfo?.registeredDate ?? null, companyName: fields[dossier.direction === "NK" ? "NNK_TEN" : "NXK_TEN"]?.value ?? "",
    },
  };
}

/**
 * Xem màn "Qua khu vực giám sát". Lần đầu với NK container: tạo bản DRAFT từ chứng từ đã đọc (người có quyền sửa); người chỉ xem thấy bản điền sẵn nhưng không lưu.
 */
export async function getKvgs(deps: CustomsDeps, ctx: Ctx, dossierId: string, branch: number): Promise<Result<KvgsView>> {
  const pre = await preload(deps, ctx, dossierId);
  if (!pre.ok) return pre;
  const { dossier, snap } = pre.value;
  const needsDraft = containerListRequired(dossier.direction, dossier.transportMode);
  const canWrite = requireRole(ctx, ...KVGS_ROLES).ok;
  const prefill = needsDraft ? await prefillRows(deps, ctx.orgId, dossierId) : null;
  const view = (r: CustomsRepos) => async () => {
    const scope = await loadScope(ctx, dossier, branch, r);
    if (!scope.ok) return scope;
    const list = needsDraft ? await r.containerLists.latest(ctx.orgId, dossierId, branch) : null;
    return ok({ scope: scope.value, list });
  };
  let read = await deps.uow.asOrg(ctx, (r) => view(r)());
  if (!read.ok) return read;
  if (needsDraft && !read.value.list && canWrite) {
    const now = deps.clock.now();
    const draft: ContainerListRecord = { id: deps.idGen.next("cls"), orgId: ctx.orgId, dossierId, branch, attempt: 1, rows: prefill ?? [], status: "DRAFT", refId: null, receiptNo: null, receiptDate: null, errors: null, sentRows: null, sentBy: null, sentAt: null, createdAt: now, updatedAt: now };
    // Insert ở giao dịch riêng: hai lần xem đầu đồng thời → bên chậm vi phạm unique (dossier, branch, attempt) làm hỏng giao dịch; bỏ qua rồi đọc lại bản của bên kia.
    try {
      await deps.uow.asOrg(ctx, (r) => r.containerLists.insert(draft));
    } catch (e) {
      if (!isDuplicate(e)) throw e;
    }
    read = await deps.uow.asOrg(ctx, (r) => view(r)());
    if (!read.ok) return read;
  }
  const { scope, list } = read.value;
  return deps.uow.asOrg(ctx, async (r) => ok(await buildView(ctx, snap, scope, r, list, prefill)));
}
