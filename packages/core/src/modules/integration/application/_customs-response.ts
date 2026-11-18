// Xử lý phản hồi Hải quan – MỘT chỗ cho mọi nguồn, như ProcessResponse bên API C#:
//   - phản hồi trả ngay của nghiệp vụ gửi đi (IDA/IDC/IDB/IDE/AMA… – process-outbox),
//   - thông điệp trả sau VNACCSREP (customs-messages),
//   - tra cứu IID/IEX (perform-operation.queryNow).
// Đọc JSON FPT → kiểu nội bộ ở gateway (FptVnaccsGateway); ở đây chỉ ÁP phản hồi đã đọc vào kết quả tờ khai và hồ sơ:
//   applyCustomsResponse (trong transaction, dòng kết quả đã khóa) → recordApplied (gom theo hồ sơ) → finishDossier (sau commit).
import { AWAITING_CLEARANCE, baseOp, isContentOperation, stageAfter, type CustomsOperation } from "@kb/contracts";
import type { OrgId, UserId } from "../../../shared/ids.js";
import { mergeCustomsInfo } from "../domain/customs-info.js";
import { coarseState, stageOf, TERMINAL, type ResultRaw } from "../domain/state-machine.js";
import { parseLineIds } from "./_catalog-numbers.js";
import { syncDossierClearance } from "./_clearance.js";
import { CHANNEL_NOTES } from "./_customs-view.js";
import type { CustomsDeps, CustomsRepos, GatewayError, GatewayStatus, OutboxRow, ResultRow } from "./customs-ports.js";
import { applyPostAmendmentResult } from "./post-amendment.js";
import { parseSent } from "./sent-sheets.js";

export type Channel = "GREEN" | "YELLOW" | "RED";

/** Phản hồi Hải quan đã đọc (gateway), theo nguồn. */
export type CustomsResponse =
  /** Trạng thái tờ khai Hải quan báo về: thông điệp VNACCSREP hoặc tra cứu IID/IEX. */
  | { kind: "STATUS"; status: GatewayStatus }
  /** Phản hồi trả ngay của nghiệp vụ gửi đi (dòng outbox). `patch`: số, luồng, thông tin Hải quan… đọc từ phản hồi. */
  | { kind: "OPERATION"; op: CustomsOperation; outbox: OutboxRow; errors?: GatewayError[]; patch: Partial<ResultRow>; side?: string; receiptNo?: string };

/** Kết quả áp. `locked`: tờ ở giai đoạn cuối (đã xác nhận hủy / từ chối) – không đổi gì. `saved`: kết quả đã ghi. */
export type ResponseApplied = {
  locked: boolean;
  saved: ResultRow | null;
  /** Tờ vừa chuyển sang thông quan do Hải quan báo (STATUS) – báo người duyệt. */
  cleared: boolean;
  /** Cần gộp lại trạng thái thông quan của hồ sơ (vừa thông quan, AMC). */
  sync: boolean;
  /** Luồng cần báo / đưa lên hồ sơ: STATUS – chỉ khi đổi luồng; OPERATION – luồng Hải quan trả trong phản hồi. */
  channel: Channel | null;
  /** Số tờ khai mới nhận trong phản hồi (OPERATION) – đưa lên hồ sơ (tờ 1). */
  declarationNo: string | null;
  /** Hải quan vừa báo tờ khai đã hủy (lần đầu) – báo người duyệt xác nhận hủy. */
  cancelReported: boolean;
};

const LOCKED: ResponseApplied = { locked: true, saved: null, cleared: false, sync: false, channel: null, declarationNo: null, cancelReported: false };
/** Phản hồi chỉ ghi nhật ký (thông báo thuế, chỉ thị…), không đổi kết quả tờ khai. */
export const NO_CHANGE: ResponseApplied = { locked: false, saved: null, cleared: false, sync: false, channel: null, declarationNo: null, cancelReported: false };

/**
 * Áp một phản hồi Hải quan vào kết quả tờ khai nhánh. Gọi TRONG transaction; `latest` là dòng kết quả đã khóa (getForUpdate).
 * Quy tắc chung: tờ ở giai đoạn cuối → không đổi; thông tin Hải quan (customsInfo) gộp dần; luồng kèm ghi chú luồng.
 */
export async function applyCustomsResponse(r: CustomsRepos, latest: ResultRow, resp: CustomsResponse, now: Date): Promise<ResponseApplied> {
  const stage = stageOf(latest);
  if (TERMINAL.has(stage)) return LOCKED;
  return resp.kind === "STATUS" ? applyStatus(r, latest, resp.status, now) : applyOperation(r, latest, resp, now);
}

/**
 * STATUS: chỉ tờ đang chờ thông quan mới đổi giai đoạn và trạng thái thông quan (thông điệp/tra cứu cũ không kéo lùi trạng thái).
 * Hải quan báo Hủy (TK_TRANGTHAI "R"): VNACCS không có trạng thái "từ chối" sau khai chính thức và hủy cần lý do + văn bản (QUY-TRINH §9.2) →
 * không tự đổi giai đoạn; ghi cancelReportedAt (lần đầu báo người duyệt xác nhận hủy, customs-poll ngừng hỏi).
 */
async function applyStatus(r: CustomsRepos, latest: ResultRow, st: GatewayStatus, now: Date): Promise<ResponseApplied> {
  const stage = stageOf(latest);
  const waiting = AWAITING_CLEARANCE.has(stage) && !st.cancelled;
  const nextStage = waiting && st.cleared ? "CLEARED" : stage;
  const cancelReported = !!st.cancelled && !latest.raw?.cancelReportedAt;
  const saved: ResultRow = {
    ...latest, state: coarseState(nextStage, latest.state === "SEND_FAILED" && nextStage === stage),
    ...(waiting ? { clearanceStatus: st.cleared ? "CLEARED" as const : "INSPECTING" as const } : {}),
    ...(st.channel ? { channel: st.channel, channelNote: CHANNEL_NOTES[st.channel] } : {}),
    raw: {
      ...(latest.raw ?? {}), stage: nextStage, lastStatus: st.status, ...(cancelReported ? { cancelReportedAt: now.toISOString() } : {}),
      ...(st.info ? { customsInfo: mergeCustomsInfo(latest.raw?.customsInfo, { ...st.info, receivedAt: now.toISOString() }) } : {}),
    },
    updatedAt: now,
  };
  await r.results.upsert(saved);
  const cleared = nextStage === "CLEARED" && stage !== "CLEARED";
  return { locked: false, saved, cleared, sync: cleared, channel: st.channel && st.channel !== latest.channel ? st.channel : null, declarationNo: null, cancelReported };
}

/**
 * OPERATION: chuyển giai đoạn theo máy trạng thái (customs-flow.stageAfter); bị từ chối → giữ giai đoạn, lưu lỗi theo chỉ tiêu.
 * Nội dung tờ Hải quan vừa nhận (IDA/IDA01/EDA/EDA01 thành công) = ảnh chụp + id dòng ghi lúc dựng outbox (spec §2.5, C6); gửi khác / bị từ chối → giữ.
 */
async function applyOperation(r: CustomsRepos, latest: ResultRow, resp: Extract<CustomsResponse, { kind: "OPERATION" }>, now: Date): Promise<ResponseApplied> {
  const { op, outbox: ob } = resp;
  const stage = stageOf(latest);
  const failed = !!resp.errors?.length;
  const nextStage = failed ? stage : stageAfter(stage, op) ?? stage;
  const { rejection: prevRejection, sent: prevSent, sentLineIds: prevLineIds, ...prevRaw } = latest.raw ?? {};
  const contentSent = !failed && isContentOperation(op) && op !== "AMA";
  const sent = contentSent ? parseSent((ob.payload as { sent?: unknown } | null)?.sent) : prevSent ?? null;
  const sentLineIds = contentSent ? parseLineIds((ob.payload as { lineIds?: unknown } | null)?.lineIds) : prevLineIds ?? null;
  // Lỗi có nội dung từ Hải quan → lưu để màn Review gắn vào ô chỉ tiêu; gửi lại thành công cùng nghiệp vụ → xóa.
  const rejection = failed
    ? { operation: op, at: now.toISOString(), errors: resp.errors!.map((e) => ({ code: e.code, message: e.message, ...(e.solution ? { solution: e.solution } : {}), ...(e.field ? { field: e.field } : {}), ...(e.line ? { line: e.line } : {}) })) }
    : prevRejection && prevRejection.operation !== op ? prevRejection : undefined;
  const { raw: patchRaw, ...patch } = resp.patch;
  const b = baseOp(op);
  const raw: ResultRaw = {
    ...prevRaw, ...(patchRaw ?? {}), stage: nextStage, ...(rejection ? { rejection } : {}), ...(sent ? { sent } : {}), ...(sentLineIds ? { sentLineIds } : {}),
    ...(failed ? {} : { done: [...new Set([...(latest.raw?.done ?? []), op])] }),
    ...(resp.side ? { side: { ...(latest.raw?.side ?? {}), [op]: resp.side } } : {}),
    ...(!failed && b === "IDE" ? { amendments: (latest.raw?.amendments ?? 0) + 1 } : {}),
    ...(!failed && op === "AMC" ? { postAmendments: (latest.raw?.postAmendments ?? 0) + 1 } : {}),
    // C6: lúc nhận số (mới / đổi) – ngày ghi danh mục khi Hải quan không trả ngày đăng ký (kể cả khi ghi bù sau crash).
    ...(!failed && patch.declarationNo && patch.declarationNo !== latest.declarationNo ? { numberAt: now.toISOString() } : {}),
  };
  const saved: ResultRow = {
    ...latest, ...patch, raw, state: coarseState(nextStage, failed),
    ...(!failed && op === "AMC" ? { clearanceStatus: "CLEARED" as const } : {}),
    updatedAt: now,
  };
  // Sau thông quan: AMA/AMB/AMC đổi trạng thái bản khai bổ sung (tờ khai gốc giữ nguyên).
  if (!failed && (op === "AMA" || op === "AMB" || op === "AMC")) await applyPostAmendmentResult(r, latest.orgId, latest.dossierId, op, now, { receiptNo: resp.receiptNo }, latest.branch);
  await r.results.upsert(saved);
  return { locked: false, saved, cleared: false, sync: !failed && op === "AMC", channel: failed ? null : patch.channel ?? null, declarationNo: failed ? null : patch.declarationNo ?? null, cancelReported: false };
}

/** Những gì các phản hồi đã đổi trên một hồ sơ – gom để xử lý một lần sau commit. */
export type DossierTouch = {
  /** Tờ vừa thông quan: nhánh → số tờ khai. */
  cleared: Map<number, string>;
  /** Tờ có luồng cần báo: nhánh → luồng + số tờ khai. */
  channels: Map<number, { channel: Channel; declarationNo: string }>;
  /** Tờ Hải quan vừa báo đã hủy: nhánh → số tờ khai. */
  cancelled: Map<number, string>;
  /** Số tờ khai / luồng của hồ sơ (lấy từ tờ 1). */
  dossier: { declarationNo?: string; channel?: Channel };
  sync: boolean;
};

export const emptyTouch = (): DossierTouch => ({ cleared: new Map(), channels: new Map(), cancelled: new Map(), dossier: {}, sync: false });

export const touchOf = (map: Map<string, DossierTouch>, dossierId: string): DossierTouch => {
  const t = map.get(dossierId) ?? emptyTouch();
  map.set(dossierId, t);
  return t;
};

/** Gom kết quả applyCustomsResponse của tờ `branch`. */
export function recordApplied(t: DossierTouch, branch: number, applied: ResponseApplied): void {
  if (applied.locked || !applied.saved) return;
  const no = applied.saved.declarationNo ?? "";
  if (applied.cleared) t.cleared.set(branch, no);
  if (applied.cancelReported) t.cancelled.set(branch, no);
  if (applied.sync) t.sync = true;
  if (applied.channel) t.channels.set(branch, { channel: applied.channel, declarationNo: no });
  if (branch === 1) {
    if (applied.channel) t.dossier.channel = applied.channel;
    if (applied.declarationNo) t.dossier.declarationNo = applied.declarationNo;
  }
}

/**
 * Sau commit, mọi nguồn phản hồi: số tờ khai / luồng tờ 1 → hồ sơ; gộp trạng thái thông quan hồ sơ; phát sự kiện;
 * báo người duyệt luồng và tờ vừa thông quan (mỗi lần áp một lần).
 */
export async function finishDossier(deps: CustomsDeps, ctx: { orgId: OrgId; userId: UserId }, dossierId: string, t: DossierTouch): Promise<void> {
  if (t.dossier.declarationNo || t.dossier.channel) await deps.dossiers.update(ctx.orgId, dossierId, { ...t.dossier });
  const summary = t.sync || t.cancelled.size ? await syncDossierClearance(deps, ctx, dossierId) : null;
  await deps.dossiers.publish(ctx.orgId, dossierId, { type: "customs.message" });
  if (!t.channels.size && !t.cleared.size && !t.cancelled.size) return;
  const code = (await deps.dossiers.get(ctx.orgId, dossierId))?.code ?? "Hồ sơ";
  const href = `/dossiers/${dossierId}?step=submit`;
  for (const { channel, declarationNo } of t.channels.values()) {
    await deps.notify?.notify(ctx.orgId, { dossierOwnerOf: dossierId, roles: ["APPROVER"] }, { title: `${code}: ${CHANNEL_NOTES[channel].split(" – ")[0]}`, body: `Số tờ khai ${declarationNo}. ${CHANNEL_NOTES[channel]}.`, href });
  }
  for (const [branch, declarationNo] of t.cleared) {
    const sheet = summary && summary.of > 1 ? ` – Tờ ${branch}/${summary.of}` : "";
    await deps.notify?.notify(ctx.orgId, { dossierOwnerOf: dossierId, roles: ["APPROVER"] }, { title: `${code}${sheet} đã thông quan`, body: `Số tờ khai ${declarationNo} – Hải quan báo thông quan.`, href });
  }
  for (const [branch, declarationNo] of t.cancelled) {
    const sheet = summary && summary.of > 1 ? ` – Tờ ${branch}/${summary.of}` : "";
    await deps.notify?.notify(ctx.orgId, { dossierOwnerOf: dossierId, roles: ["APPROVER"] }, { title: `${code}${sheet}: Hải quan báo tờ khai đã hủy`, body: `Số tờ khai ${declarationNo} – Hải quan báo trạng thái Hủy. Kiểm tra văn bản Hải quan rồi bấm "Xác nhận tờ khai đã hủy".`, href });
  }
}
