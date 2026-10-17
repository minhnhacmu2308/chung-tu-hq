// Worker `customs-send`: một dòng outbox → ghi OUT (một lần) → gọi gateway → ghi IN → chuyển giai đoạn (customs-flow.stageAfter).
// Không tự gửi nghiệp vụ kế tiếp: người khai điều khiển luồng (IDA → IDC…). Khai chính thức thành công → hỏi trạng thái định kỳ.
import { baseOp, CUSTOMS_OPERATIONS, isRecallOperation, stageAfter, type CustomsInfo, type CustomsOperation } from "@kb/contracts";
import { domainError } from "../../../shared/errors.js";
import { asOrgId, asUserId } from "../../../shared/ids.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { maskPayload } from "../domain/mask.js";
import { mergeCustomsInfo } from "../domain/customs-info.js";
import { coarseState, stageOf, type ResultRaw } from "../domain/state-machine.js";
import { CHANNEL_NOTES, OPERATION_LABELS } from "./_customs-view.js";
import type { CustomsDeps, CustomsRepos, GatewayError, MessageRow, OutboxRow, ResultRow } from "./customs-ports.js";

export type ProcessOutboxInput = { orgId: string; userId: string; outboxId: string };
/** Quá số lần thử (= attempts của BullMQ) → outbox FAILED, người dùng "Gửi lại". */
export const MAX_ATTEMPTS = 5;
const isDomainError = (e: unknown): e is { code: string; message?: string } => typeof e === "object" && e !== null && "code" in e && typeof (e as { code: unknown }).code === "string";

const fmtErrors = (errors: GatewayError[]) => errors.map((e) => `${e.code}${e.field ? ` (${e.field})` : ""}: ${e.message}${e.solution ? ` → ${e.solution}` : ""}`).join("; ");
const channelVi = (c: "GREEN" | "YELLOW" | "RED") => (c === "GREEN" ? "xanh" : c === "YELLOW" ? "vàng" : "đỏ");
const outSummary = (op: CustomsOperation) => `${OPERATION_LABELS[op]} (${op})`;

/** Gộp thông tin Hải quan trả về vào raw (thời điểm nhận theo clock của hệ thống). */
const withInfo = (raw: ResultRaw | null, info: CustomsInfo | undefined, at: Date): { raw?: ResultRaw } =>
  info ? { raw: { customsInfo: mergeCustomsInfo(raw?.customsInfo, { ...info, receivedAt: at.toISOString() }) } } : {};

type Outcome = { errors?: GatewayError[]; summary: string; payload: unknown; patch: Partial<ResultRow>; side?: string };

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
  const stage = stageOf(result);
  if (ob.attempts >= MAX_ATTEMPTS) {
    // Hết số lần thử (lỗi tạm kéo dài): không để PENDING mãi – FAILED để người dùng Gửi lại.
    await deps.uow.asOrg(ctx, async (r) => {
      await msg(r, { operation: ob.operation, direction: "IN", result: "ERROR", summary: `Không gửi được sau ${ob.attempts} lần thử: ${ob.lastError ?? "lỗi kết nối"} – bấm Gửi lại`, payloadMasked: { error: ob.lastError }, externalRef: result.externalId });
      await r.outbox.update(ob.id, { status: "FAILED", updatedAt: now() });
      await r.results.upsert({ ...result, state: coarseState(stage, true), updatedAt: now() });
    });
    await deps.dossiers.publish(input.orgId, ob.dossierId, { type: "customs.message" });
    return ok({ status: "FAILED", next: null });
  }

  // Thông điệp OUT ghi đúng một lần (job chạy lại sau crash không nhân đôi).
  if (ob.attempts === 0) {
    await deps.uow.asOrg(ctx, async (r) => {
      await msg(r, { operation: ob.operation, direction: "OUT", result: "OK", summary: outSummary(ob.operation), payloadMasked: maskPayload(payload.request ?? { files: payload.files }), externalRef: result.externalId });
      await r.outbox.update(ob.id, { attempts: 1, updatedAt: now() });
    });
  } else await deps.uow.asOrg(ctx, (r) => r.outbox.update(ob.id, { attempts: ob.attempts + 1, updatedAt: now() }));

  const op = ob.operation;
  const b = baseOp(op);
  if (CUSTOMS_OPERATIONS[op].kind === "query") return err(domainError("NOT_SUPPORTED", `${op} là tra cứu – không gửi qua outbox`));
  let outcome: Outcome;
  try {
    if (b === "IDA") {
      // Chạy lại sau crash ở lần khai đầu: Hải quan đã cấp số cho lần gửi trước thì không gửi lại (spec §3.3).
      const already = ob.attempts > 0 && result.externalId && stage === "NOT_SENT" ? await deps.gateway.queryStatus(input.orgId, result.externalId, ob.dossierId).catch(() => null) : null;
      const res = already?.declarationNo ? { externalId: result.externalId!, declarationNo: already.declarationNo, ...(already.info ? { info: already.info } : {}) } : await deps.gateway.preDeclare(input.orgId, { kind: op === "EDA" ? "EDA" : "IDA", request: payload.request, dossierId: ob.dossierId }, ob.idempotencyKey);
      const no = res.declarationNo ?? result.declarationNo;
      outcome = res.errors?.length
        ? { errors: res.errors, summary: "", payload: null, patch: res.externalId ? { externalId: res.externalId } : {} }
        : { summary: `Hải quan cấp số tờ khai ${no ?? "(chưa có)"} – kiểm tra thuế dự kiến rồi khai chính thức`, payload: { nghiepVu: op, ketQua: "Thành công", soToKhai: no, warnings: payload.warnings }, patch: { externalId: res.externalId, declarationNo: no ?? null, ...withInfo(result.raw, res.info, now()) } };
    } else if (b === "IDC") {
      const res = await deps.gateway.declare(input.orgId, { kind: op === "EDC" ? "EDC" : "IDC", externalId: result.externalId ?? "", dossierId: ob.dossierId }, ob.idempotencyKey);
      const errors = res.errors ?? (!res.accepted ? [{ code: "E-IDC-REJECT", message: "Hải quan không chấp nhận khai chính thức" }] : res.channel ? undefined : [{ code: "E-IDC-NO-CHANNEL", message: "Hải quan chấp nhận nhưng chưa trả kết quả phân luồng – bấm Tra cứu trạng thái hoặc gửi lại" }]);
      outcome = errors?.length || !res.channel
        ? { errors: errors ?? [], summary: "", payload: null, patch: {} }
        : { summary: `Kết quả phân luồng: luồng ${channelVi(res.channel)}`, payload: { nghiepVu: op, soToKhai: result.declarationNo, maPhanLuong: res.channel === "GREEN" ? 1 : res.channel === "YELLOW" ? 2 : 3, thueDuKien: `${res.customsTaxVnd ?? result.customsTaxVnd ?? "0"} VND` }, patch: { channel: res.channel, channelNote: CHANNEL_NOTES[res.channel], ...(res.customsTaxVnd ? { customsTaxVnd: res.customsTaxVnd } : {}), ...withInfo(result.raw, res.info, now()) } };
    } else if (op === "HYS") {
      const docs = payload.files ?? [];
      const files = await Promise.all(docs.map(async (f) => ({ name: f.name, bytes: await deps.dossiers.readFile(f.storageKey) })));
      const declaration = (await deps.declarations.get(input.orgId, ob.dossierId))?.payload;
      const res = await deps.gateway.attachDocuments(input.orgId, { externalId: result.externalId ?? "", dossierId: ob.dossierId, files, ...(declaration ? { declaration } : {}) }, ob.idempotencyKey);
      const side = `Đã tiếp nhận ${files.length} tệp${res.receiptNo ? ` – số tiếp nhận ${res.receiptNo}` : ""}`;
      outcome = res.errors?.length
        ? { errors: res.errors, summary: "", payload: null, patch: {} }
        : { summary: `Đã tiếp nhận hồ sơ chứng từ điện tử (${files.length} tệp)${res.receiptNo ? ` – số tiếp nhận ${res.receiptNo}` : ""}`, payload: { nghiepVu: "HYS", soToKhai: result.declarationNo, soTep: files.length, soTiepNhan: res.receiptNo }, patch: res.receiptNo ? { raw: { receiptNo: res.receiptNo } } : {}, side };
    } else {
      const res = await deps.gateway.send(input.orgId, { op, externalId: result.externalId ?? "", dossierId: ob.dossierId, request: payload.request }, ob.idempotencyKey);
      const detail = [res.note, res.receiptNo ? `số tiếp nhận ${res.receiptNo}` : null, res.channel ? `luồng ${channelVi(res.channel)}` : null].filter(Boolean).join(" – ");
      outcome = res.errors?.length
        ? { errors: res.errors, summary: "", payload: null, patch: {} }
        : {
            summary: `${OPERATION_LABELS[op]}: ${detail || "Hải quan đã tiếp nhận"}`,
            payload: { nghiepVu: op, soToKhai: result.declarationNo, ...(res.receiptNo ? { soTiepNhan: res.receiptNo } : {}), ...(res.channel ? { phanLuong: res.channel } : {}) },
            patch: res.channel ? { channel: res.channel, channelNote: CHANNEL_NOTES[res.channel], ...(res.customsTaxVnd ? { customsTaxVnd: res.customsTaxVnd } : {}) } : {},
            ...(op === "CONT" || op === "PORT_FEE" ? { side: detail } : {}),
          };
    }
  } catch (e) {
    if (isDomainError(e)) {
      // Lỗi vĩnh viễn (chưa cấu hình, chưa hỗ trợ, dữ liệu sai): không retry – FAILED để người dùng xử lý.
      outcome = { errors: [{ code: e.code, message: e.message ?? e.code }], summary: "", payload: null, patch: {} };
    } else {
      // Lỗi tạm (mạng/5xx): ghi nhật ký, giữ PENDING, ném để BullMQ retry với backoff.
      const message = e instanceof Error ? e.message : String(e);
      await deps.uow.asOrg(ctx, async (r) => {
        await msg(r, { operation: op, direction: "IN", result: "ERROR", summary: `Lỗi tạm thời khi gửi: ${message} – sẽ thử lại`, payloadMasked: { error: message }, externalRef: result.externalId });
        await r.outbox.update(ob.id, { lastError: message, nextAttemptAt: new Date(now().getTime() + 30_000), updatedAt: now() });
      });
      throw e;
    }
  }

  const failed = !!outcome.errors?.length;
  const nextStage = failed ? stage : stageAfter(stage, op) ?? stage;
  const raw: ResultRaw = {
    ...(result.raw ?? {}), ...(outcome.patch.raw ?? {}), stage: nextStage,
    ...(failed ? {} : { done: [...new Set([...(result.raw?.done ?? []), op])] }),
    ...(outcome.side ? { side: { ...(result.raw?.side ?? {}), [op]: outcome.side } } : {}),
    ...(!failed && (b === "IDE") ? { amendments: (result.raw?.amendments ?? 0) + 1 } : {}),
    ...(!failed && op === "AMC" ? { postAmendments: (result.raw?.postAmendments ?? 0) + 1 } : {}),
  };
  const { raw: _r, ...patch } = outcome.patch;
  await deps.uow.asOrg(ctx, async (r) => {
    if (failed) {
      await msg(r, { operation: op, direction: "IN", result: "ERROR", summary: `${OPERATION_LABELS[op]} bị từ chối: ${fmtErrors(outcome.errors!)}`, payloadMasked: { errorList: outcome.errors }, externalRef: result.externalId });
      await r.outbox.update(ob.id, { status: "FAILED", lastError: fmtErrors(outcome.errors!), updatedAt: now() });
    } else {
      await msg(r, { operation: op, direction: "IN", result: "OK", summary: outcome.summary, payloadMasked: maskPayload(outcome.payload), externalRef: patch.externalId ?? result.externalId });
      await r.outbox.update(ob.id, { status: "SENT", lastError: null, updatedAt: now() });
    }
    await r.results.upsert({
      ...result, ...patch, raw, state: coarseState(nextStage, failed),
      ...(!failed && op === "AMC" ? { clearanceStatus: "CLEARED" as const } : {}),
      updatedAt: now(),
    });
  });

  if (!failed) {
    if (patch.declarationNo || patch.channel) await deps.dossiers.update(input.orgId, ob.dossierId, { ...(patch.declarationNo ? { declarationNo: patch.declarationNo } : {}), ...(patch.channel ? { channel: patch.channel } : {}) });
    // Gọi về sửa: mở lại tờ khai (DRAFT, bước Review) để sửa chỉ tiêu và duyệt lại.
    if (isRecallOperation(op)) await deps.declarations.markDraft(ctx, ob.dossierId);
    if (op === "AMC") await deps.dossiers.update(input.orgId, ob.dossierId, { status: "CLEARED" });
    // Khai chính thức / khai chính thức sửa đổi → hỏi trạng thái tới khi thông quan.
    if (b === "IDC" || b === "IDE") await deps.queue.enqueue("customs-poll", { orgId: input.orgId, userId: input.userId, dossierId: ob.dossierId, attempt: 1 }, { jobId: `customs-poll:${ob.dossierId}:${ob.id}:1`, delayMs: deps.pollDelayMs });
  }
  await deps.dossiers.publish(input.orgId, ob.dossierId, { type: "customs.message" });
  if (!failed && patch.channel) await deps.notify?.notify(input.orgId, { dossierOwnerOf: ob.dossierId, roles: ["APPROVER"] }, { title: `${dossier.code}: ${CHANNEL_NOTES[patch.channel].split(" – ")[0]}`, body: `Số tờ khai ${patch.declarationNo ?? result.declarationNo ?? ""}. ${CHANNEL_NOTES[patch.channel]}.`, href: `/dossiers/${ob.dossierId}?step=submit` });
  if (!failed && isRecallOperation(op)) await deps.notify?.notify(input.orgId, { dossierOwnerOf: ob.dossierId }, { title: `${dossier.code}: đã gọi tờ khai về sửa (${op})`, body: "Sửa chỉ tiêu ở bước Review, phê duyệt lại rồi gửi khai tạm.", href: `/dossiers/${ob.dossierId}?step=review` });
  if (failed) await deps.notify?.notify(input.orgId, { dossierOwnerOf: ob.dossierId }, { title: `${dossier.code}: ${OPERATION_LABELS[op]} bị từ chối`, body: fmtErrors(outcome.errors!).slice(0, 300), href: `/dossiers/${ob.dossierId}?step=submit` });
  return ok({ status: failed ? "FAILED" : "SENT", next: null });
}
