// Worker `customs-send`: một dòng outbox → ghi OUT (một lần) → gọi gateway → ghi IN → chuyển giai đoạn (customs-flow.stageAfter).
// Không tự gửi nghiệp vụ kế tiếp: người khai điều khiển luồng (IDA → IDC…). Khai chính thức thành công → hỏi trạng thái định kỳ.
// NGOẠI LỆ DUY NHẤT (spec tách tờ khai §6.2/6.4): gửi nội dung tờ khai (IDA/EDA, IDA01/EDA01) của tờ khai nhánh k thành công trong một lần truyền
// (outbox có ghim phiên bản) → tự gửi nội dung tờ kế tiếp cần gửi (NOT_SENT/RECALLED → IDA, AMEND_RECALLED → IDA01; TK_FIC = số tờ khai nhánh 1)
// cùng ghim; tờ đã có outbox cùng lần truyền → không tạo thêm; khóa theo nhánh + unique chặn tạo trùng (chainNextBranch).
import { baseOp, branchCount, CUSTOMS_OPERATIONS, isContentOperation, isRecallOperation, queryOpFor, stageAfter, type CustomsInfo, type CustomsOperation } from "@kb/contracts";
import { domainError, type DomainError } from "../../../shared/errors.js";
import { asOrgId, asUserId, type OrgId, type UserId } from "../../../shared/ids.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { meterSafely } from "../../../shared/usage.js";
import { maskPayload } from "../domain/mask.js";
import { mergeCustomsInfo } from "../domain/customs-info.js";
import { coarseState, stageOf, type ResultRaw } from "../domain/state-machine.js";
import { CHANNEL_NOTES, OPERATION_LABELS } from "./_customs-view.js";
import type { CustomsDeps, CustomsRepos, GatewayError, MessageRow, OutboxRow, ResultRow } from "./customs-ports.js";
import { applyPostAmendmentResult } from "./post-amendment.js";
import { syncDossierClearance } from "./poll-status.js";
import { parseSent } from "./sent-sheets.js";
import { contentOpFor, declareOpFor, enqueueBranchPreDeclare, outboxVersion, stalePinReason } from "./branch-send.js";
import { performOperationChecked } from "./perform-operation.js";

/** Chuỗi nối tiếp dừng ở tờ `branch` vì guard (declare = chuỗi khai chính thức cả lô). */
type ChainStop = { branch: number; of: number; error: DomainError; declare?: boolean };
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

type Outcome = { errors?: GatewayError[]; summary: string; payload: unknown; patch: Partial<ResultRow>; side?: string; /** Số tiếp nhận Hải quan trả về (AMA: số tờ khai bổ sung). */ receiptNo?: string };

export async function processOutbox(deps: CustomsDeps, input: ProcessOutboxInput): Promise<Result<{ status: OutboxRow["status"]; next: CustomsOperation | null }>> {
  const ctx = { orgId: asOrgId(input.orgId), userId: asUserId(input.userId) };
  const prep = await deps.uow.asOrg(ctx, async (r) => {
    const ob = await r.outbox.get(input.orgId, input.outboxId);
    if (!ob) return err(domainError("NOT_FOUND", "Không tìm thấy outbox"));
    const result = await r.results.get(input.orgId, ob.dossierId, ob.branch);
    if (!result) return err(domainError("INVALID_STATE", "Chưa có kết quả truyền"));
    return ok({ ob, result });
  });
  if (!prep.ok) return prep;
  const { ob, result } = prep.value;
  if (ob.status !== "PENDING") {
    // Job chạy lại sau crash giữa lúc ghi SENT và lúc nối tờ kế tiếp → nối lại (idempotent; lỗi guard đã/ sẽ được ghi ở lần chạy chính).
    if (ob.status === "SENT") await chainNextBranch(deps, ctx, ob);
    return ok({ status: ob.status, next: null });
  }
  const dossier = await deps.dossiers.get(input.orgId, ob.dossierId);
  if (!dossier) return err(domainError("NOT_FOUND", "Không tìm thấy hồ sơ"));
  const now = () => deps.clock.now();
  const msg = (r: CustomsRepos, m: Omit<MessageRow, "id" | "orgId" | "dossierId" | "branch" | "at">) => r.messages.insert({ id: deps.idGen.next("msg"), orgId: input.orgId, dossierId: ob.dossierId, branch: ob.branch, at: now(), ...m });
  const payload = (ob.payload ?? {}) as { request?: unknown; warnings?: string[]; issues?: string[]; files?: { name: string; storageKey: string }[] };
  const stage = stageOf(result);
  if (ob.attempts >= MAX_ATTEMPTS) {
    // Hết số lần thử (lỗi tạm kéo dài): không để PENDING mãi – FAILED để người dùng Gửi lại.
    await deps.uow.asOrg(ctx, async (r) => {
      await msg(r, { operation: ob.operation, direction: "IN", result: "ERROR", summary: `Không gửi được sau ${ob.attempts} lần thử: ${ob.lastError ?? "lỗi kết nối"} – bấm Gửi lại`, payloadMasked: { error: ob.lastError }, externalRef: result.externalId });
      await r.outbox.update(ob.orgId, ob.id, { status: "FAILED", updatedAt: now() });
      await r.results.upsert({ ...result, state: coarseState(stage, true), updatedAt: now() });
    });
    await deps.dossiers.publish(input.orgId, ob.dossierId, { type: "customs.message" });
    return ok({ status: "FAILED", next: null });
  }

  // Nội dung tờ khai đã ghim (tờ 2..N, lô nhiều tờ) chỉ gửi khi tờ khai còn SUBMITTED đúng phiên bản + lần duyệt đã xếp gửi:
  // đã gọi về sửa / duyệt lại → không gửi nội dung cũ; tờ đó SEND_FAILED để giao diện báo lỗi.
  if (isContentOperation(ob.operation) && ob.operation !== "AMA") {
    const stale = stalePinReason(await deps.declarations.get(input.orgId, ob.dossierId), ob);
    if (stale) {
      const reason = `Tờ ${ob.branch}: không gửi ${baseOp(ob.operation) === "IDA" ? "khai tạm" : OPERATION_LABELS[ob.operation].toLowerCase()} – ${stale}; duyệt lại rồi truyền lại`;
      await deps.uow.asOrg(ctx, async (r) => {
        await msg(r, { operation: ob.operation, direction: "IN", result: "ERROR", summary: reason, payloadMasked: { error: reason }, externalRef: result.externalId });
        await r.outbox.update(ob.orgId, ob.id, { status: "FAILED", lastError: reason, updatedAt: now() });
        await r.results.upsert({ ...result, state: coarseState(stage, true), updatedAt: now() });
      });
      await deps.dossiers.publish(input.orgId, ob.dossierId, { type: "customs.message" });
      return ok({ status: "FAILED", next: null });
    }
  }

  // Thông điệp OUT ghi đúng một lần (job chạy lại sau crash không nhân đôi).
  if (ob.attempts === 0) {
    await deps.uow.asOrg(ctx, async (r) => {
      await msg(r, { operation: ob.operation, direction: "OUT", result: "OK", summary: outSummary(ob.operation), payloadMasked: maskPayload(payload.request ?? { files: payload.files }), externalRef: result.externalId });
      await r.outbox.update(ob.orgId, ob.id, { attempts: 1, updatedAt: now() });
    });
  } else await deps.uow.asOrg(ctx, (r) => r.outbox.update(ob.orgId, ob.id, { attempts: ob.attempts + 1, updatedAt: now() }));

  const op = ob.operation;
  const b = baseOp(op);
  if (CUSTOMS_OPERATIONS[op].kind === "query") return err(domainError("NOT_SUPPORTED", `${op} là tra cứu – không gửi qua outbox`));
  /**
   * Ghi chi phí Customs Hub ngay khi gateway trả lời (kể cả bị từ chối nghiệp vụ – thông điệp đã được xử lý).
   * Khóa = idempotencyKey của outbox: job chạy lại gửi lại cùng thông điệp (FPT không xử lý lần hai) không tính thêm.
   * Lỗi tạm (mạng/5xx, ném ra) và lỗi chưa cấu hình/chưa hỗ trợ (chưa gửi được) → không ghi.
   */
  const meterSent = () =>
    meterSafely(deps.usage, { orgId: input.orgId, dossierId: ob.dossierId, provider: "CUSTOMS_HUB", kind: "CUSTOMS_SEND", operation: op, quantity: 1, dedupeKey: `customs:${ob.idempotencyKey}`, meta: { outboxId: ob.id } });
  let outcome: Outcome;
  try {
    if (b === "IDA") {
      // Chạy lại sau crash ở lần khai đầu: Hải quan đã cấp số cho lần gửi trước thì không gửi lại (spec §3.3).
      const already = ob.attempts > 0 && result.externalId && stage === "NOT_SENT" ? await deps.gateway.queryStatus(input.orgId, result.externalId, ob.dossierId).catch(() => null) : null;
      if (already) {
        const qop = queryOpFor(dossier.direction);
        await meterSafely(deps.usage, { orgId: input.orgId, dossierId: ob.dossierId, provider: "CUSTOMS_HUB", kind: "CUSTOMS_QUERY", operation: qop, quantity: 1, meta: { outboxId: ob.id } });
      }
      const res = already?.declarationNo ? { externalId: result.externalId!, declarationNo: already.declarationNo, ...(already.info ? { info: already.info } : {}) } : await deps.gateway.preDeclare(input.orgId, { kind: op === "EDA" ? "EDA" : "IDA", request: payload.request, dossierId: ob.dossierId }, ob.idempotencyKey);
      if (!already?.declarationNo) await meterSent();
      const no = res.declarationNo ?? result.declarationNo;
      outcome = res.errors?.length
        ? { errors: res.errors, summary: "", payload: null, patch: res.externalId ? { externalId: res.externalId } : {} }
        : { summary: `Hải quan cấp số tờ khai ${no ?? "(chưa có)"} – kiểm tra thuế dự kiến rồi khai chính thức`, payload: { nghiepVu: op, ketQua: "Thành công", soToKhai: no, warnings: payload.warnings }, patch: { externalId: res.externalId, declarationNo: no ?? null, ...withInfo(result.raw, res.info, now()) } };
    } else if (b === "IDC") {
      const res = await deps.gateway.declare(input.orgId, { kind: op === "EDC" ? "EDC" : "IDC", externalId: result.externalId ?? "", dossierId: ob.dossierId }, ob.idempotencyKey);
      await meterSent();
      const errors = res.errors ?? (!res.accepted ? [{ code: "E-IDC-REJECT", message: "Hải quan không chấp nhận khai chính thức" }] : res.channel ? undefined : [{ code: "E-IDC-NO-CHANNEL", message: "Hải quan chấp nhận nhưng chưa trả kết quả phân luồng – bấm Tra cứu trạng thái hoặc gửi lại" }]);
      outcome = errors?.length || !res.channel
        ? { errors: errors ?? [], summary: "", payload: null, patch: {} }
        : { summary: `Kết quả phân luồng: luồng ${channelVi(res.channel)}`, payload: { nghiepVu: op, soToKhai: result.declarationNo, maPhanLuong: res.channel === "GREEN" ? 1 : res.channel === "YELLOW" ? 2 : 3, thueDuKien: `${res.customsTaxVnd ?? result.customsTaxVnd ?? "0"} VND` }, patch: { channel: res.channel, channelNote: CHANNEL_NOTES[res.channel], ...(res.customsTaxVnd ? { customsTaxVnd: res.customsTaxVnd } : {}), ...withInfo(result.raw, res.info, now()) } };
    } else if (op === "HYS") {
      const docs = payload.files ?? [];
      const files = await Promise.all(docs.map(async (f) => ({ name: f.name, bytes: await deps.dossiers.readFile(f.storageKey) })));
      const declaration = (await deps.declarations.get(input.orgId, ob.dossierId))?.payload;
      const res = await deps.gateway.attachDocuments(input.orgId, { externalId: result.externalId ?? "", dossierId: ob.dossierId, files, ...(declaration ? { declaration } : {}) }, ob.idempotencyKey);
      await meterSent();
      const side = `Đã tiếp nhận ${files.length} tệp${res.receiptNo ? ` – số tiếp nhận ${res.receiptNo}` : ""}`;
      outcome = res.errors?.length
        ? { errors: res.errors, summary: "", payload: null, patch: {} }
        : { summary: `Đã tiếp nhận hồ sơ chứng từ điện tử (${files.length} tệp)${res.receiptNo ? ` – số tiếp nhận ${res.receiptNo}` : ""}`, payload: { nghiepVu: "HYS", soToKhai: result.declarationNo, soTep: files.length, soTiepNhan: res.receiptNo }, patch: res.receiptNo ? { raw: { receiptNo: res.receiptNo } } : {}, side };
    } else {
      const res = await deps.gateway.send(input.orgId, { op, externalId: result.externalId ?? "", dossierId: ob.dossierId, request: payload.request }, ob.idempotencyKey);
      await meterSent();
      const detail = [res.note, res.receiptNo ? `số tiếp nhận ${res.receiptNo}` : null, res.channel ? `luồng ${channelVi(res.channel)}` : null].filter(Boolean).join(" – ");
      outcome = res.errors?.length
        ? { errors: res.errors, summary: "", payload: null, patch: {} }
        : {
            summary: `${OPERATION_LABELS[op]}: ${detail || "Hải quan đã tiếp nhận"}`,
            payload: { nghiepVu: op, soToKhai: result.declarationNo, ...(res.receiptNo ? { soTiepNhan: res.receiptNo } : {}), ...(res.channel ? { phanLuong: res.channel } : {}) },
            patch: res.channel ? { channel: res.channel, channelNote: CHANNEL_NOTES[res.channel], ...(res.customsTaxVnd ? { customsTaxVnd: res.customsTaxVnd } : {}) } : {},
            ...(op === "CONT" || op === "PORT_FEE" ? { side: detail } : {}),
            ...(res.receiptNo ? { receiptNo: res.receiptNo } : {}),
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
        await r.outbox.update(ob.orgId, ob.id, { lastError: message, nextAttemptAt: new Date(now().getTime() + 30_000), updatedAt: now() });
      });
      throw e;
    }
  }

  const failed = !!outcome.errors?.length;
  const nextStage = failed ? stage : stageAfter(stage, op) ?? stage;
  const { rejection: prevRejection, sent: prevSent, ...prevRaw } = result.raw ?? {};
  // Lô nhiều tờ: nội dung tờ Hải quan vừa nhận (IDA/IDA01/EDA/EDA01 thành công) = ảnh chụp ghi lúc dựng outbox (spec §2.5). Outbox không mang ảnh chụp
  // (lô một tờ, outbox cũ) → bỏ ảnh chụp cũ (không còn đúng nội dung Hải quan giữ). Gửi khác / bị từ chối → giữ nguyên.
  const sent = !failed && isContentOperation(op) && op !== "AMA" ? parseSent((ob.payload as { sent?: unknown } | null)?.sent) : prevSent ?? null;
  // Lỗi có nội dung từ Hải quan → lưu để màn Review gắn vào ô chỉ tiêu; gửi lại thành công cùng nghiệp vụ → xóa.
  const rejection = failed
    ? { operation: op, at: now().toISOString(), errors: outcome.errors!.map((e) => ({ code: e.code, message: e.message, ...(e.solution ? { solution: e.solution } : {}), ...(e.field ? { field: e.field } : {}), ...(e.line ? { line: e.line } : {}) })) }
    : prevRejection && prevRejection.operation !== op ? prevRejection : undefined;
  const raw: ResultRaw = {
    ...prevRaw, ...(outcome.patch.raw ?? {}), stage: nextStage, ...(rejection ? { rejection } : {}), ...(sent ? { sent } : {}),
    ...(failed ? {} : { done: [...new Set([...(result.raw?.done ?? []), op])] }),
    ...(outcome.side ? { side: { ...(result.raw?.side ?? {}), [op]: outcome.side } } : {}),
    ...(!failed && (b === "IDE") ? { amendments: (result.raw?.amendments ?? 0) + 1 } : {}),
    ...(!failed && op === "AMC" ? { postAmendments: (result.raw?.postAmendments ?? 0) + 1 } : {}),
  };
  const { raw: _r, ...patch } = outcome.patch;
  await deps.uow.asOrg(ctx, async (r) => {
    if (failed) {
      await msg(r, { operation: op, direction: "IN", result: "ERROR", summary: `${OPERATION_LABELS[op]} bị từ chối: ${fmtErrors(outcome.errors!)}`, payloadMasked: { errorList: outcome.errors }, externalRef: result.externalId });
      await r.outbox.update(ob.orgId, ob.id, { status: "FAILED", lastError: fmtErrors(outcome.errors!), updatedAt: now() });
    } else {
      await msg(r, { operation: op, direction: "IN", result: "OK", summary: outcome.summary, payloadMasked: maskPayload(outcome.payload), externalRef: patch.externalId ?? result.externalId });
      await r.outbox.update(ob.orgId, ob.id, { status: "SENT", lastError: null, updatedAt: now() });
    }
    // Sau thông quan: AMA/AMB/AMC đổi trạng thái bản khai bổ sung (tờ khai gốc giữ nguyên).
    if (!failed && (op === "AMA" || op === "AMB" || op === "AMC")) await applyPostAmendmentResult(r, input.orgId, ob.dossierId, op, now(), { receiptNo: outcome.receiptNo }, ob.branch);
    await r.results.upsert({
      ...result, ...patch, raw, state: coarseState(nextStage, failed),
      ...(!failed && op === "AMC" ? { clearanceStatus: "CLEARED" as const } : {}),
      updatedAt: now(),
    });
  });

  if (!failed) {
    // Số tờ khai và phân luồng của hồ sơ lấy từ nhánh 1 (tờ 2..N có số, luồng riêng trên kết quả nhánh).
    const declarationNo = ob.branch === 1 ? patch.declarationNo : undefined;
    const channel = ob.branch === 1 ? patch.channel : undefined;
    if (declarationNo || channel) await deps.dossiers.update(input.orgId, ob.dossierId, { ...(declarationNo ? { declarationNo } : {}), ...(channel ? { channel } : {}) });
    // Gọi về sửa: mở lại tờ khai (DRAFT, bước Review) để sửa chỉ tiêu và duyệt lại.
    if (isRecallOperation(op) && op !== "AMB") await deps.declarations.markDraft(ctx, ob.dossierId);
    // AMC: tờ khai nhánh về CLEARED → hồ sơ CLEARED khi mọi tờ thông quan.
    if (op === "AMC") await syncDossierClearance(deps, ctx, ob.dossierId);
    // Khai chính thức / khai chính thức sửa đổi → hỏi trạng thái tới khi thông quan.
    if (b === "IDC" || b === "IDE") await deps.queue.enqueue("customs-poll", { orgId: input.orgId, userId: input.userId, dossierId: ob.dossierId, ...(ob.branch > 1 ? { branch: ob.branch } : {}), attempt: 1 }, { jobId: `customs-poll:${ob.dossierId}:${ob.id}:1`, delayMs: deps.pollDelayMs });
  }
  if (!failed) {
    const chained = await chainNextBranch(deps, ctx, ob);
    if (chained) {
      // Không khai tạm được tờ kế tiếp (tờ khai bị mở lại, HS/BLOCKER, đổi tuần tỷ giá…): ghi lỗi trên nhánh đó, báo chủ hồ sơ; nhánh giữ NOT_SENT.
      const what = chained.declare ? "khai chính thức" : "khai tạm";
      const summary = `Tờ ${chained.branch}/${chained.of}: chưa ${what} tự động – ${chained.error.message ?? chained.error.code}`;
      await deps.uow.asOrg(ctx, (r) => r.messages.insert({ id: deps.idGen.next("msg"), orgId: input.orgId, dossierId: ob.dossierId, branch: chained.branch, operation: ob.operation, direction: "IN", result: "ERROR", summary, payloadMasked: { error: chained.error.message ?? chained.error.code }, externalRef: null, at: now() }));
      await deps.notify?.notify(input.orgId, { dossierOwnerOf: ob.dossierId }, { title: `${dossier.code}: chưa ${what} tờ ${chained.branch}/${chained.of}`, body: summary.slice(0, 300), href: `/dossiers/${ob.dossierId}?step=submit` });
    }
  }
  await deps.dossiers.publish(input.orgId, ob.dossierId, { type: "customs.message" });
  if (!failed && patch.channel) await deps.notify?.notify(input.orgId, { dossierOwnerOf: ob.dossierId, roles: ["APPROVER"] }, { title: `${dossier.code}: ${CHANNEL_NOTES[patch.channel].split(" – ")[0]}`, body: `Số tờ khai ${patch.declarationNo ?? result.declarationNo ?? ""}. ${CHANNEL_NOTES[patch.channel]}.`, href: `/dossiers/${ob.dossierId}?step=submit` });
  if (!failed && isRecallOperation(op)) {
    const amb = op === "AMB";
    await deps.notify?.notify(input.orgId, { dossierOwnerOf: ob.dossierId }, {
      title: `${dossier.code}: ${amb ? "đã gọi bản khai bổ sung về sửa" : "đã gọi tờ khai về sửa"} (${op})`,
      body: amb ? "Sửa bản khai bổ sung ở bước Review (tab Khai bổ sung AMA), phê duyệt lại rồi khai AMA." : "Sửa chỉ tiêu ở bước Review, phê duyệt lại rồi gửi khai tạm.",
      href: `/dossiers/${ob.dossierId}?step=review`,
    });
  }
  if (failed) await deps.notify?.notify(input.orgId, { dossierOwnerOf: ob.dossierId }, { title: `${dossier.code}: ${OPERATION_LABELS[op]} bị từ chối`, body: fmtErrors(outcome.errors!).slice(0, 300), href: `/dossiers/${ob.dossierId}?step=submit` });
  return ok({ status: failed ? "FAILED" : "SENT", next: null });
}

/**
 * Nối tiếp (ngoại lệ duy nhất cho "không tự gửi nghiệp vụ kế tiếp"): nội dung tờ k (IDA/EDA, IDA01/EDA01) đã SENT trong một lần truyền có ghim
 * → gửi nội dung tờ kế tiếp cần gửi theo giai đoạn của tờ (bỏ qua tờ không cần gửi), cùng phiên bản + ghim. Tờ đó đã có outbox cùng lần truyền
 * → enqueueBranchPreDeclare không tạo thêm (dừng; bị từ chối → người khai Gửi lại, thành công thì nối tiếp). Trả lỗi guard (không tạo gì) hoặc null.
 */
async function chainNextBranch(deps: CustomsDeps, ctx: { orgId: OrgId; userId: UserId }, ob: OutboxRow): Promise<ChainStop | null> {
  // Khai chính thức cả lô: IDC/IDE/EDC/EDE của tờ k đã SENT (outbox mang chain = "declare") → khai chính thức tờ kế tiếp đang khai tạm. Lỗi guard → báo như chuỗi khai tạm.
  if ((ob.payload as { chain?: unknown } | null)?.chain === "declare") return chainDeclare(deps, ctx, ob);
  if (!isContentOperation(ob.operation) || ob.operation === "AMA") return null;
  // Phiên bản đã truyền ở tờ k (khóa `:v<n>`); khóa không có phiên bản (gửi theo lượt `:n<k>`, lô một tờ) → không nối tự động.
  const version = outboxVersion(ob.idempotencyKey);
  if (version === null) return null;
  const pin = (ob.payload as { pin?: unknown } | null)?.pin;
  const snap = await deps.declarations.get(ctx.orgId, ob.dossierId);
  if (!snap) return null;
  // Dừng ở số tờ hiện tại của tờ khai (không theo số kết quả đã lưu).
  const of = branchCount(snap.payload.items.length);
  const results = await deps.uow.asOrg(ctx, (r) => r.results.listForDossier(ctx.orgId, ob.dossierId));
  const next = results.find((r) => r.branch > ob.branch && r.branch <= of && contentOpFor(stageOf(r), snap.payload.kind));
  if (!next) return null;
  const res = await enqueueBranchPreDeclare(deps, ctx, ob.dossierId, next.branch, { by: "chain", version, ...(typeof pin === "string" ? { pin } : {}) });
  return res.ok ? null : { branch: next.branch, of, error: res.error };
}

/**
 * Chuỗi khai chính thức cả lô: tờ k vừa khai chính thức xong → tờ kế tiếp (branch lớn hơn, trong số tờ hiện tại) có declareOpFor khác null thì gửi IDC/IDE tiếp,
 * qua performOperationChecked (cùng guard với người khai bấm, trừ kiểm vai trò – worker không có phiên). Tờ kế tiếp đã có outbox đang chờ → performOperation chặn (không tạo trùng).
 * Bị từ chối thì không tới đây (chỉ nối khi SENT) – người khai xử lý tờ đó rồi khai chính thức cả lô lại.
 */
async function chainDeclare(deps: CustomsDeps, ctx: { orgId: OrgId; userId: UserId }, ob: OutboxRow): Promise<ChainStop | null> {
  const snap = await deps.declarations.get(ctx.orgId, ob.dossierId);
  if (!snap) return null;
  const of = branchCount(snap.payload.items.length);
  const { results, all } = await deps.uow.asOrg(ctx, async (r) => ({ results: await r.results.listForDossier(ctx.orgId, ob.dossierId), all: await r.outbox.listForDossier(ctx.orgId, ob.dossierId) }));
  // Idempotent khi job chạy lại sau SENT (ADR 0005): đã có outbox chuỗi khai chính thức ở tờ sau, tạo cùng/sau outbox này → chuỗi đã đi tiếp (hoặc đang chờ người khai Gửi lại) – không tạo thêm.
  if (all.some((o) => o.id !== ob.id && o.branch > ob.branch && o.createdAt >= ob.createdAt && (o.payload as { chain?: unknown } | null)?.chain === "declare")) return null;
  const next = results.filter((r) => r.branch > ob.branch && r.branch <= of).sort((a, b) => a.branch - b.branch).find((r) => declareOpFor(stageOf(r), snap.payload.kind));
  if (!next) return null;
  const op = declareOpFor(stageOf(next), snap.payload.kind)!;
  const res = await performOperationChecked(deps, ctx, ob.dossierId, op, next.branch, { chain: "declare", chainFrom: ob.id });
  // Trùng khóa (bản chạy lại) = đã xếp, không phải lỗi.
  return res.ok || res.error.code === "ALREADY_SUBMITTED" ? null : { branch: next.branch, of, error: res.error, declare: true };
}
