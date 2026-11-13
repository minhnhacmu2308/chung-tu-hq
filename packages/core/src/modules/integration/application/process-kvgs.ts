// Worker `customs-send`, nhánh CONT_LIST / KVGS (ADR 0014; như HYS – khai trước/sau tờ khai nên không đọc customs_results để chặn):
// - CONT_LIST: outbox → gateway.sendContainerList → REF_ID lưu vào bản ghi + xếp job `kvgs-poll` (hỏi kết quả sau KVGS_POLL_DELAY_MS).
//   Idempotent: bản ghi đã có REF_ID (crash giữa ghi và xếp job) → không gửi lại, chỉ xếp lại job poll (jobId cố định nên không nhân đôi).
// - KVGS: outbox → gateway.fetchKvgs (POST /api/KVGS, một lời gọi đồng bộ) → ghi kết quả ngay (ACCEPTED + bảng kê / REJECTED + lỗi), không REF_ID, không poll.
//   Tra cứu chỉ đọc: crash giữa lời gọi và lúc ghi → job chạy lại gọi lại (phí khóa theo idempotencyKey nên không tính hai lần).
// Lỗi nghiệp vụ (cổng từ chối, chưa cấu hình, thiếu dữ liệu) → bản ghi REJECTED + errors; lỗi tạm (mạng/5xx) → ném để BullMQ retry.
import { z } from "zod";
import type { OrgId, UserId } from "../../../shared/ids.js";
import { ok, type Result } from "../../../shared/result.js";
import { meterSafely } from "../../../shared/usage.js";
import { loadRefRequests } from "./_kvgs-request.js";
import { MAX_ATTEMPTS } from "./_outbox.js";
import type { ContainerListRecord, CustomsDeps, GatewayError, MessageRow, OutboxRow } from "./customs-ports.js";
import { fmtErrors, isDomainError, KVGS_POLL_DELAY_MS, LABEL, loadTarget, patchTarget, type KvgsTargetKind } from "./poll-kvgs.js";

export const ContListPayload = z.object({ listId: z.string().min(1) });
/** Outbox cũ còn `kind` (CONTAINER/CARGO): Zod loại bỏ key thừa khi parse – API KVGS tự xác định loại hàng (isContainer). */
export const KvgsPayload = z.object({ kvgsId: z.string().min(1) });

type ActorCtx = { orgId: OrgId; userId: UserId };
type Done = Result<{ status: OutboxRow["status"]; next: null }>;

export async function processKvgsOutbox(deps: CustomsDeps, ctx: ActorCtx, ob: OutboxRow): Promise<Done> {
  const kind: KvgsTargetKind = ob.operation === "CONT_LIST" ? "CONT_LIST" : "KVGS";
  const label = LABEL[kind];
  const now = () => deps.clock.now();
  const msg = (r: Parameters<Parameters<CustomsDeps["uow"]["asOrg"]>[1]>[0], m: Pick<MessageRow, "direction" | "result" | "summary" | "payloadMasked">) =>
    r.messages.insert({ id: deps.idGen.next("msg"), orgId: ob.orgId, dossierId: ob.dossierId, branch: ob.branch, operation: ob.operation, externalRef: null, at: now(), ...m });
  const publish = () => deps.dossiers.publish(ob.orgId, ob.dossierId, { type: "customs.message" });
  const enqueuePoll = (id: string) =>
    deps.queue.enqueue("kvgs-poll", { orgId: ob.orgId, userId: ctx.userId, kind: "CONT_LIST", id, n: 1 }, { jobId: `kvgs-poll:CONT_LIST:${id}:1`, delayMs: KVGS_POLL_DELAY_MS });

  const id = kind === "CONT_LIST" ? ContListPayload.safeParse(ob.payload) : KvgsPayload.safeParse(ob.payload);
  const targetId = id.success ? ("listId" in id.data ? id.data.listId : id.data.kvgsId) : null;
  const target = targetId ? await loadTarget(deps, ctx, kind, targetId) : null;
  /** Outbox không gắn được vào bản ghi nào (payload hỏng / bản ghi đã xóa). */
  if (!targetId || !target || target.dossierId !== ob.dossierId) {
    if (ob.status !== "PENDING") return ok({ status: ob.status, next: null });
    const reason = `Không tìm thấy ${label} của lệnh gửi – khai lại`;
    await deps.uow.asOrg(ctx, async (r) => {
      await msg(r, { direction: "IN", result: "ERROR", summary: reason, payloadMasked: { error: reason } });
      await r.outbox.update(ob.orgId, ob.id, { status: "FAILED", lastError: reason, updatedAt: now() });
    });
    await publish();
    return ok({ status: "FAILED", next: null });
  }

  // Job chạy lại (danh sách container): đã có REF_ID → chỉ bảo đảm job poll tồn tại (crash giữa ghi và xếp job / xếp job lỗi).
  if (kind === "CONT_LIST" && target.refId) {
    if (ob.status === "PENDING") await deps.uow.asOrg(ctx, (r) => r.outbox.update(ob.orgId, ob.id, { status: "SENT", lastError: null, updatedAt: now() }));
    if (target.status === "SENDING") await enqueuePoll(targetId);
    return ok({ status: "SENT", next: null });
  }
  if (ob.status !== "PENDING") return ok({ status: ob.status, next: null });

  /** Kết thúc không gửi được / bị từ chối: bản ghi REJECTED (+ `raw` nếu có); outbox `outboxStatus` (SENT = cổng đã xử lý thông điệp, FAILED = chưa gửi được). */
  const reject = async (errors: GatewayError[], summary: string, outboxStatus: "SENT" | "FAILED", extra: { raw?: unknown } = {}): Promise<Done> => {
    await deps.uow.asOrg(ctx, async (r) => {
      await msg(r, { direction: "IN", result: "ERROR", summary, payloadMasked: { errorList: errors } });
      await r.outbox.update(ob.orgId, ob.id, { status: outboxStatus, lastError: fmtErrors(errors), updatedAt: now() });
      await patchTarget(r, ob.orgId, kind, targetId, { status: "REJECTED", errors, ...extra }, now());
    });
    await publish();
    return ok({ status: outboxStatus, next: null });
  };
  if (target.status !== "SENDING") return reject([{ code: "E-STATE", message: `${label} không còn ở trạng thái đang gửi` }], `Không gửi ${label}: bản ghi đã đổi trạng thái`, "FAILED");
  // BullMQ (attempts 5) hết lượt trước khi attempts của outbox vượt ngưỡng → onFinalFailure gọi markOutboxFailed (reopen-declaration); nhánh này bắt job chạy lại sau đó (quét/đẩy lại tay).
  if (ob.attempts >= MAX_ATTEMPTS) {
    const reason = ob.lastError ?? "lỗi kết nối";
    return reject([{ code: "E-SEND", message: reason }], `Không gửi được ${label} sau ${ob.attempts} lần thử: ${reason} – khai lại`, "FAILED");
  }

  // Thông điệp OUT ghi đúng một lần (job chạy lại sau crash không nhân đôi).
  if (ob.attempts === 0) {
    const summary = kind === "CONT_LIST" ? `Khai danh sách container (${(target as ContainerListRecord).rows.length} dòng)` : "Lấy bảng kê qua khu vực giám sát (KVGS)";
    await deps.uow.asOrg(ctx, async (r) => {
      await msg(r, { direction: "OUT", result: "OK", summary, payloadMasked: { nghiepVu: ob.operation } });
      await r.outbox.update(ob.orgId, ob.id, { attempts: 1, updatedAt: now() });
    });
  } else await deps.uow.asOrg(ctx, (r) => r.outbox.update(ob.orgId, ob.id, { attempts: ob.attempts + 1, updatedAt: now() }));

  const built = await loadRefRequests(deps, ctx, ob.dossierId, ob.branch);
  if (!built.ok) return reject([{ code: built.error.code, message: built.error.message ?? built.error.code }], `Không gửi ${label}: ${built.error.message ?? built.error.code}`, "FAILED");

  /** Gọi cổng: lỗi vĩnh viễn (DomainError – chưa cấu hình…) → `failed` (REJECTED, không retry, không tính phí); lỗi tạm (mạng/5xx) → ghi lastError rồi ném (BullMQ retry). */
  const callGateway = async <T>(fn: () => Promise<T>): Promise<{ value: T } | { failed: Done }> => {
    try {
      return { value: await fn() };
    } catch (e) {
      if (isDomainError(e)) {
        const errors = [{ code: e.code, message: e.message ?? e.code }];
        return { failed: await reject(errors, `Không gửi được ${label}: ${fmtErrors(errors)}`, "FAILED") };
      }
      const message = e instanceof Error ? e.message : String(e);
      await deps.uow.asOrg(ctx, async (r) => {
        await msg(r, { direction: "IN", result: "ERROR", summary: `Lỗi tạm thời khi gửi ${label}: ${message} – sẽ thử lại`, payloadMasked: { error: message } });
        await r.outbox.update(ob.orgId, ob.id, { lastError: message, nextAttemptAt: new Date(now().getTime() + 30_000), updatedAt: now() });
      });
      throw e;
    }
  };
  // Cổng đã xử lý thông điệp (kể cả từ chối) → chi phí; khóa = idempotencyKey (chạy lại không tính thêm).
  const meter = () =>
    meterSafely(deps.usage, { orgId: ob.orgId, dossierId: ob.dossierId, provider: "CUSTOMS_HUB", kind: "CUSTOMS_SEND", operation: ob.operation, quantity: 1, dedupeKey: `customs:${ob.idempotencyKey}`, meta: { outboxId: ob.id } });

  if (kind === "KVGS") {
    const call = await callGateway(() => deps.gateway.fetchKvgs(ob.orgId, built.value.kvgs, ob.idempotencyKey));
    if ("failed" in call) return call.failed;
    await meter();
    const res = call.value;
    const raw = res.raw === undefined ? {} : { raw: res.raw };
    // REJECTED (errorList của FPT / thiếu dữ liệu để in – KVGS_RESPONSE_INCOMPLETE): giữ `raw` để truy vết.
    if (res.state === "REJECTED" || !res.sheet) {
      const errors = res.errors?.length ? res.errors : [{ code: "KVGS_RESPONSE_INCOMPLETE", message: "Phản hồi của Hải quan thiếu thông tin để in" }];
      return reject(errors, `${label}: ${fmtErrors(errors)}`, "SENT", raw);
    }
    const sheet = res.sheet;
    const what = sheet.kind === "CONTAINER" ? `${sheet.containers.length} container` : "hàng lẻ";
    await deps.uow.asOrg(ctx, async (r) => {
      await msg(r, { direction: "IN", result: "OK", summary: `Đã lấy ${label} – tờ khai ${sheet.declarationNo}, ${what}`, payloadMasked: { nghiepVu: ob.operation, soToKhai: sheet.declarationNo, loaiHang: sheet.kind } });
      await r.outbox.update(ob.orgId, ob.id, { status: "SENT", lastError: null, updatedAt: now() });
      await patchTarget(r, ob.orgId, kind, targetId, { status: "ACCEPTED", errors: null, sheet, raw: res.raw ?? null, fetchedAt: now() }, now());
    });
    await publish();
    return ok({ status: "SENT", next: null });
  }

  // Cửa sổ crash: gateway đã nhận nhưng chưa ghi REF_ID → job chạy lại gửi lại cùng idempotencyKey. Giới hạn giống HYS (process-hys) và IDA/IDC (process-outbox):
  // không có dấu hiệu "đã gửi" riêng, dựa vào idempotencyKey (FPT không xử lý lần hai – xem meterSent ở process-outbox). Cửa sổ chỉ là một lần ghi DB.
  const list = target as ContainerListRecord;
  const rows = list.sentRows ?? list.rows;
  const call = await callGateway(() =>
    deps.gateway.sendContainerList(ob.orgId, { ...built.value.head, rows: rows.map((x) => ({ billNo: x.billNo, containerNo: x.containerNo, sealNo: x.sealNo, note: x.note })) }, ob.idempotencyKey),
  );
  if ("failed" in call) return call.failed;
  await meter();
  const res = call.value;
  if (res.errors?.length) return reject(res.errors, `${label} bị từ chối: ${fmtErrors(res.errors)}`, "SENT");
  if (!res.refId) return reject([{ code: "E-NO-REFID", message: "Cổng không trả mã tham chiếu (REF_ID)" }], `Không gửi được ${label}: cổng không trả REF_ID`, "SENT");
  const refId = res.refId;
  await deps.uow.asOrg(ctx, async (r) => {
    await msg(r, { direction: "IN", result: "OK", summary: `Đã gửi ${label} – mã tham chiếu ${refId}, đang chờ Hải quan phản hồi`, payloadMasked: { nghiepVu: ob.operation, refId } });
    await r.outbox.update(ob.orgId, ob.id, { status: "SENT", lastError: null, updatedAt: now() });
    await patchTarget(r, ob.orgId, kind, targetId, { status: "SENDING", refId, errors: null }, now());
  });
  await enqueuePoll(targetId);
  await publish();
  return ok({ status: "SENT", next: null });
}
