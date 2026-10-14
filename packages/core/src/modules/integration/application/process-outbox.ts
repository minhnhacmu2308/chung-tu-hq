// Worker `customs-send`: một dòng outbox → ghi OUT (một lần) → gọi gateway → ghi IN → máy trạng thái → bước kế tiếp tự tạo outbox.
import type { CustomsOperation } from "@kb/contracts";
import { domainError } from "../../../shared/errors.js";
import { asOrgId, asUserId } from "../../../shared/ids.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { maskPayload } from "../domain/mask.js";
import { next, nextOperation, type SubmissionEvent } from "../domain/state-machine.js";
import { CHANNEL_NOTES, OPERATION_LABELS } from "./_customs-view.js";
import type { CustomsDeps, CustomsRepos, GatewayError, MessageRow, OutboxRow, ResultRow } from "./customs-ports.js";
import { outboxKey } from "./submit-declaration.js";

export type ProcessOutboxInput = { orgId: string; userId: string; outboxId: string };
/** Quá số lần thử (= attempts của BullMQ) → outbox FAILED, người dùng "Gửi lại". */
export const MAX_ATTEMPTS = 5;
const isDomainError = (e: unknown): e is { code: string; message?: string } => typeof e === "object" && e !== null && "code" in e && typeof (e as { code: unknown }).code === "string";

const fmtErrors = (errors: GatewayError[]) => errors.map((e) => `${e.code}${e.field ? ` (${e.field})` : ""}: ${e.message}${e.solution ? ` → ${e.solution}` : ""}`).join("; ");

export async function processOutbox(deps: CustomsDeps, input: ProcessOutboxInput): Promise<Result<{ status: OutboxRow["status"]; next: CustomsOperation | null }>> {
  const ctx = { orgId: asOrgId(input.orgId), userId: asUserId(input.userId) };
  const prep = await deps.uow.asOrg(ctx, async (r) => {
    const ob = await r.outbox.get(input.orgId, input.outboxId);
    if (!ob) return err(domainError("NOT_FOUND", "Không tìm thấy outbox"));
    const result = await r.results.get(input.orgId, ob.dossierId);
    if (!result) return err(domainError("INVALID_STATE", "Chưa có kết quả truyền"));
    return ok({ ob, result });
  });
  if (!prep.ok) return prep;
  const { ob, result } = prep.value;
  if (ob.status !== "PENDING") return ok({ status: ob.status, next: null });
  const dossier = await deps.dossiers.get(input.orgId, ob.dossierId);
  if (!dossier) return err(domainError("NOT_FOUND", "Không tìm thấy hồ sơ"));
  const now = () => deps.clock.now();
  const msg = (r: CustomsRepos, m: Omit<MessageRow, "id" | "orgId" | "dossierId" | "at">) => r.messages.insert({ id: deps.idGen.next("msg"), orgId: input.orgId, dossierId: ob.dossierId, at: now(), ...m });
  const payload = (ob.payload ?? {}) as { request?: unknown; warnings?: string[]; issues?: string[]; files?: { name: string; storageKey: string }[] };
  if (ob.attempts >= MAX_ATTEMPTS) {
    // Hết số lần thử (lỗi tạm kéo dài): không để PENDING mãi – FAILED để người dùng Gửi lại.
    await deps.uow.asOrg(ctx, async (r) => {
      await msg(r, { operation: ob.operation, direction: "IN", result: "ERROR", summary: `Không gửi được sau ${ob.attempts} lần thử: ${ob.lastError ?? "lỗi kết nối"} – bấm Gửi lại`, payloadMasked: { error: ob.lastError }, externalRef: result.externalId });
      await r.outbox.update(ob.id, { status: "FAILED", updatedAt: now() });
      await r.results.upsert({ ...result, state: "SEND_FAILED", updatedAt: now() });
    });
    await deps.dossiers.publish(input.orgId, ob.dossierId, { type: "customs.message" });
    return ok({ status: "FAILED", next: null });
  }

  // Thông điệp OUT ghi đúng một lần (job chạy lại sau crash không nhân đôi).
  if (ob.attempts === 0) {
    await deps.uow.asOrg(ctx, async (r) => {
      await msg(r, { operation: ob.operation, direction: "OUT", result: "OK", summary: `${OPERATION_LABELS[ob.operation].startsWith("Gửi") ? OPERATION_LABELS[ob.operation] : `Gửi ${OPERATION_LABELS[ob.operation].toLowerCase()}`} (${ob.operation})`, payloadMasked: maskPayload(payload.request ?? { files: payload.files }), externalRef: result.externalId });
      await r.outbox.update(ob.id, { attempts: 1, updatedAt: now() });
    });
  } else await deps.uow.asOrg(ctx, (r) => r.outbox.update(ob.id, { attempts: ob.attempts + 1, updatedAt: now() }));

  let event: SubmissionEvent;
  let inSummary: string;
  let inPayload: unknown;
  let errors: GatewayError[] | undefined;
  const patch: Partial<ResultRow> = {};
  try {
    if (ob.operation === "IDA" || ob.operation === "EDA") {
      // Chạy lại sau crash: nếu Hải quan đã cấp số tờ khai cho lần gửi trước thì không gửi lại (spec §3.3).
      const already = ob.attempts > 0 && result.externalId ? await deps.gateway.queryStatus(input.orgId, result.externalId, ob.dossierId).catch(() => null) : null;
      const res = already?.declarationNo ? { externalId: result.externalId!, declarationNo: already.declarationNo } : await deps.gateway.preDeclare(input.orgId, { kind: ob.operation, request: payload.request, dossierId: ob.dossierId }, ob.idempotencyKey);
      errors = res.errors;
      patch.externalId = res.externalId;
      if (!errors?.length) {
        patch.declarationNo = res.declarationNo ?? null;
        event = { type: "PRE_DECLARE_OK" };
        inSummary = `Hải quan cấp số tờ khai ${res.declarationNo ?? "(chưa có)"}`;
        inPayload = { nghiepVu: ob.operation, ketQua: "Thành công", soToKhai: res.declarationNo, warnings: payload.warnings };
      } else event = { type: "PRE_DECLARE_FAIL" };
    } else if (ob.operation === "IDC" || ob.operation === "EDC") {
      const res = await deps.gateway.declare(input.orgId, { kind: ob.operation, externalId: result.externalId ?? "", dossierId: ob.dossierId }, ob.idempotencyKey);
      errors = res.errors ?? (res.accepted ? undefined : [{ code: "E-IDC-REJECT", message: "Hải quan không chấp nhận khai chính thức" }]);
      if (!errors?.length && res.channel) {
        patch.channel = res.channel;
        patch.channelNote = CHANNEL_NOTES[res.channel];
        if (res.customsTaxVnd) patch.customsTaxVnd = res.customsTaxVnd;
        event = { type: "DECLARE_OK", channel: res.channel };
        const vi = res.channel === "GREEN" ? "xanh" : res.channel === "YELLOW" ? "vàng" : "đỏ";
        inSummary = `Kết quả phân luồng: luồng ${vi}`;
        inPayload = { nghiepVu: ob.operation, soToKhai: result.declarationNo, maPhanLuong: res.channel === "GREEN" ? 1 : res.channel === "YELLOW" ? 2 : 3, thueDuKien: `${patch.customsTaxVnd ?? result.customsTaxVnd ?? "0"} VND` };
      } else event = { type: "DECLARE_FAIL" };
    } else if (ob.operation === "HYS") {
      const docs = payload.files ?? [];
      const files = await Promise.all(docs.map(async (f) => ({ name: f.name, bytes: await deps.dossiers.readFile(f.storageKey) })));
      const res = await deps.gateway.attachDocuments(input.orgId, { externalId: result.externalId ?? "", dossierId: ob.dossierId, files }, ob.idempotencyKey);
      errors = res.errors;
      if (!errors?.length) {
        event = { type: "DOCS_OK" };
        patch.raw = { ...(result.raw ?? { progress: "DECLARED" }), ...(res.receiptNo ? { receiptNo: res.receiptNo } : {}) };
        inSummary = `Đã tiếp nhận hồ sơ chứng từ điện tử (${files.length} tệp)${res.receiptNo ? ` – số tiếp nhận ${res.receiptNo}` : ""}`;
        inPayload = { nghiepVu: "HYS", soToKhai: result.declarationNo, soTep: files.length, soTiepNhan: res.receiptNo };
      } else event = { type: "DOCS_FAIL" };
    } else return err(domainError("NOT_SUPPORTED", `Outbox không hỗ trợ ${ob.operation}`));
  } catch (e) {
    if (isDomainError(e)) {
      // Lỗi vĩnh viễn (chưa cấu hình, chưa có endpoint, dữ liệu sai): không retry – FAILED + SEND_FAILED để người dùng xử lý.
      errors = [{ code: e.code, message: e.message ?? e.code }];
      event = ob.operation === "HYS" ? { type: "DOCS_FAIL" } : ob.operation === "IDC" || ob.operation === "EDC" ? { type: "DECLARE_FAIL" } : { type: "PRE_DECLARE_FAIL" };
    } else {
      // Lỗi tạm (mạng/5xx): ghi nhật ký, giữ PENDING, ném để BullMQ retry với backoff.
      const message = e instanceof Error ? e.message : String(e);
      await deps.uow.asOrg(ctx, async (r) => {
        await msg(r, { operation: ob.operation, direction: "IN", result: "ERROR", summary: `Lỗi tạm thời khi gửi: ${message} – sẽ thử lại`, payloadMasked: { error: message }, externalRef: result.externalId });
        await r.outbox.update(ob.id, { lastError: message, nextAttemptAt: new Date(now().getTime() + 30_000), updatedAt: now() });
      });
      throw e;
    }
  }

  const progress = result.raw?.progress ?? "APPROVED";
  const transition = next(result.state === "SEND_FAILED" ? "SEND_FAILED" : result.state, progress, event);
  const failed = errors !== undefined && errors.length > 0;
  const nextOp = transition && !failed ? nextOperation(dossier.direction, transition.progress) : null;
  await deps.uow.asOrg(ctx, async (r) => {
    if (failed) {
      await msg(r, { operation: ob.operation, direction: "IN", result: "ERROR", summary: `${OPERATION_LABELS[ob.operation]} bị từ chối: ${fmtErrors(errors!)}`, payloadMasked: { errorList: errors }, externalRef: result.externalId });
      await r.outbox.update(ob.id, { status: "FAILED", lastError: fmtErrors(errors!), updatedAt: now() });
    } else {
      await msg(r, { operation: ob.operation, direction: "IN", result: "OK", summary: inSummary!, payloadMasked: maskPayload(inPayload), externalRef: patch.externalId ?? result.externalId });
      await r.outbox.update(ob.id, { status: "SENT", lastError: null, updatedAt: now() });
    }
    const raw = { ...(result.raw ?? { progress: "APPROVED" as const }), ...(patch.raw ?? {}), progress: transition?.progress ?? progress };
    await r.results.upsert({ ...result, ...patch, raw, state: transition?.state ?? result.state, updatedAt: now() });
    if (nextOp) {
      const version = Number(/:v(\d+)/.exec(ob.idempotencyKey)?.[1] ?? "1");
      const key = outboxKey(ob.dossierId, nextOp, version);
      if (!(await r.outbox.findByKey(input.orgId, key))) {
        const files = nextOp === "HYS" ? (await deps.dossiers.documents(input.orgId, ob.dossierId)).map((d) => ({ name: d.fileName, storageKey: d.storageKey })) : undefined;
        await r.outbox.insert({ id: deps.idGen.next("msg"), orgId: input.orgId, dossierId: ob.dossierId, declarationId: ob.declarationId, operation: nextOp, idempotencyKey: key, payload: files ? { files } : { request: null }, status: "PENDING", attempts: 0, lastError: null, nextAttemptAt: null, createdAt: now(), updatedAt: now() });
      }
    }
  });
  if (patch.declarationNo || patch.channel) await deps.dossiers.update(input.orgId, ob.dossierId, { ...(patch.declarationNo ? { declarationNo: patch.declarationNo } : {}), ...(patch.channel ? { channel: patch.channel } : {}) });
  if (nextOp) {
    const version = Number(/:v(\d+)/.exec(ob.idempotencyKey)?.[1] ?? "1");
    const key = outboxKey(ob.dossierId, nextOp, version);
    const nextRow = await deps.uow.asOrg(ctx, (r) => r.outbox.findByKey(input.orgId, key));
    if (nextRow?.status === "PENDING") await deps.queue.enqueue("customs-send", { orgId: input.orgId, userId: input.userId, outboxId: nextRow.id }, { jobId: `customs-send:${nextRow.id}` });
  } else if (!failed && transition?.progress === "DOCS_SENT") {
    await deps.queue.enqueue("customs-poll", { orgId: input.orgId, userId: input.userId, dossierId: ob.dossierId, attempt: 1 }, { jobId: `customs-poll:${ob.dossierId}:1`, delayMs: deps.pollDelayMs });
  }
  await deps.dossiers.publish(input.orgId, ob.dossierId, { type: "customs.message" });
  if (patch.channel) await deps.notify?.notify(input.orgId, { dossierOwnerOf: ob.dossierId, roles: ["APPROVER"] }, { title: `${dossier.code}: ${CHANNEL_NOTES[patch.channel].split(" – ")[0]}`, body: `Số tờ khai ${patch.declarationNo ?? result.declarationNo ?? ""}. ${CHANNEL_NOTES[patch.channel]}.`, href: `/dossiers/${ob.dossierId}?step=submit` });
  if (failed) await deps.notify?.notify(input.orgId, { dossierOwnerOf: ob.dossierId }, { title: `${dossier.code}: ${OPERATION_LABELS[ob.operation]} bị từ chối`, body: fmtErrors(errors!).slice(0, 300), href: `/dossiers/${ob.dossierId}?step=submit` });
  return ok({ status: failed ? "FAILED" : "SENT", next: nextOp });
}
