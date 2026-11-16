// Trạng thái tờ khai (3 nhóm) và tiến độ hồ sơ – THUẦN, dùng chung backend (tính khi trả hồ sơ) và giao diện (spec trang-thai-ho-so §2, §3.1, §4.2).
import type { CustomsChannel, DossierStatus } from "./common.js";
import { isChanneled } from "./customs-flow.js";
import type { SheetBrief } from "./dto/dossier.js";

export type DeclarationCode = "NOT_DECLARED" | "PRE_DECLARED" | "DECLARED" | "AMEND_RECALLED" | "AMEND_PRE_DECLARED" | "AMENDED" | "POST_AMENDED" | "CANCELLED" | "REJECTED";
/** Việc đang dở kèm theo trạng thái khai của tờ: đang gọi về sửa / đang sửa sau thông quan / gửi lỗi. */
export type SheetSub = "RECALLING" | "POST_EDITING" | "SEND_FAILED";

/** Trạng thái một tờ: khai báo (nhóm 1), luồng (nhóm 2), thông quan (nhóm 3) và việc đang dở. */
export function sheetStatusOf(s: SheetBrief): { declaration: DeclarationCode; channel: CustomsChannel | null; cleared: boolean; sub: SheetSub | null } {
  const { stage } = s;
  const cleared = stage === "CLEARED" || stage.startsWith("POST_");
  const declared = s.amendments > 0 ? "AMENDED" : "DECLARED";
  const declaration = declarationOf(s, cleared, declared);
  // Gửi lỗi nổi lên trước; gọi về sửa (RECALLED) và sửa sau thông quan là việc đang dở của giai đoạn.
  const sub: SheetSub | null = s.state === "SEND_FAILED" ? "SEND_FAILED"
    : stage === "RECALLED" ? "RECALLING"
    : stage === "POST_EDITING" || stage === "POST_PRE_DECLARED" || stage === "POST_RECALLED" ? "POST_EDITING"
    : null;
  // Luồng chỉ có nghĩa khi tờ đã được phân luồng (không còn khi gọi về / hủy / bị từ chối) – kết quả cũ còn lưu luồng thì bỏ.
  return { declaration, channel: isChanneled(stage) ? s.channel : null, cleared, sub };
}

/** Nhóm "khai báo" của một giai đoạn; mọi CustomsStage phải được xếp (never guard). */
function declarationOf(s: SheetBrief, cleared: boolean, declared: "AMENDED" | "DECLARED"): DeclarationCode {
  const stage = s.stage;
  switch (stage) {
    case "NOT_SENT": return "NOT_DECLARED";
    case "PRE_DECLARED": case "RECALLED": return "PRE_DECLARED";
    case "DECLARED": return declared;
    case "AMEND_RECALLED": case "AMEND_PRE_DECLARED": case "CANCELLED": case "REJECTED": return stage;
    case "CLEARED": case "POST_EDITING": case "POST_PRE_DECLARED": case "POST_RECALLED":
      return cleared ? (s.postAmendments > 0 ? "POST_AMENDED" : declared) : declared;
    default: { const _exhaustive: never = stage; return _exhaustive; }
  }
}

export type ProgressCode = "NOT_DECLARED" | "PRE_DECLARED" | "DECLARED" | "AMEND_RECALLED" | "AMEND_PRE_DECLARED" | "AMENDED" | "CLEARED" | "POST_AMENDED" | "CANCELLED" | "REJECTED" | "DOSSIER_CANCELLED";
export type ProgressSub = "PROCESSING" | "NEEDS_REVIEW" | "APPROVED_WAITING" | "SENDING" | "SEND_FAILED" | "RECALLING" | "POST_EDITING";

/** Thứ tự tiến độ từ chậm đến nhanh (spec §3.1); hồ sơ hiện mức của tờ chậm nhất. */
export const PROGRESS_ORDER: readonly ProgressCode[] = ["NOT_DECLARED", "PRE_DECLARED", "DECLARED", "AMEND_RECALLED", "AMEND_PRE_DECLARED", "AMENDED", "CLEARED", "POST_AMENDED"];

const CHANNEL_WEIGHT: Record<CustomsChannel, number> = { GREEN: 1, YELLOW: 2, RED: 3 };
const CHANNEL_STAGES: ReadonlySet<ProgressCode> = new Set(["DECLARED", "AMEND_RECALLED", "AMEND_PRE_DECLARED", "AMENDED"]);

/** Tiến độ hồ sơ từ trạng thái hồ sơ và các tờ khai nhánh: `progress` = mức của tờ chậm nhất; `ahead` = mức xa nhất trong các tờ còn sống khi khác `progress` (null nếu mọi tờ cùng mức), `done` = số tờ ở mức `ahead` (không có ahead thì = `of`). Tờ hủy/từ chối không tính. */
export function dossierProgressOf(status: DossierStatus, sheets: SheetBrief[]): {
  progress: ProgressCode; ahead: ProgressCode | null; sub: ProgressSub | null; channel: CustomsChannel | null; done: number; of: number; flags: ("SEND_FAILED" | "REJECTED")[];
} {
  const rejected = sheets.some((s) => s.stage === "REJECTED");
  const live = sheets.filter((s) => s.stage !== "CANCELLED" && s.stage !== "REJECTED");
  const flags: ("SEND_FAILED" | "REJECTED")[] = [];
  if (live.some((s) => s.state === "SEND_FAILED")) flags.push("SEND_FAILED");
  if (rejected) flags.push("REJECTED");
  const base = { ahead: null, sub: null, channel: null, done: 0, of: 1, flags };

  if (status === "CANCELLED") return { ...base, flags: [], progress: "DOSSIER_CANCELLED" };
  if (sheets.length > 0 && live.length === 0) return { ...base, progress: rejected ? "REJECTED" : "CANCELLED", of: sheets.length };

  const rows = live.map((s) => {
    const st = sheetStatusOf(s);
    const level: ProgressCode = st.cleared ? (s.postAmendments > 0 ? "POST_AMENDED" : "CLEARED") : st.declaration;
    return { s, st, level, rank: PROGRESS_ORDER.indexOf(level) };
  });
  // Hồ sơ thông quan nhưng không còn kết quả tờ (dữ liệu cũ / nhập tay): đã thông quan, không phải "chưa khai".
  if (!sheets.length && status === "CLEARED") return { ...base, progress: "CLEARED", done: 1 };
  if (!rows.length) return { ...base, progress: "NOT_DECLARED", sub: notDeclaredSub(status, false), flags };

  const rank = Math.min(...rows.map((r) => r.rank));
  const progress = PROGRESS_ORDER[rank]!;
  const at = rows.filter((r) => r.rank === rank);
  const sub: ProgressSub | null = progress === "NOT_DECLARED"
    ? notDeclaredSub(status, live.some((s) => s.state === "SEND_FAILED"))
    : at.some((r) => r.st.sub === "RECALLING") ? "RECALLING" : at.some((r) => r.st.sub === "POST_EDITING") ? "POST_EDITING" : null;

  let channel: CustomsChannel | null = null;
  if (CHANNEL_STAGES.has(progress)) {
    for (const r of rows) {
      if (r.st.cleared || !r.st.channel) continue;
      if (!channel || CHANNEL_WEIGHT[r.st.channel] > CHANNEL_WEIGHT[channel]) channel = r.st.channel;
    }
  }
  const top = Math.max(...rows.map((r) => r.rank));
  const ahead = top > rank ? PROGRESS_ORDER[top]! : null;
  return { progress, ahead, sub, channel, done: ahead ? rows.filter((r) => r.rank === top).length : rows.length, of: rows.length, flags };
}

/** Hồ sơ chưa tờ nào được khai tạm: việc đang dở theo trạng thái hồ sơ. */
function notDeclaredSub(status: DossierStatus, sendFailed: boolean): ProgressSub | null {
  switch (status) {
    case "DRAFT": case "PROCESSING": return "PROCESSING";
    case "NEEDS_REVIEW": return "NEEDS_REVIEW";
    case "APPROVED": return "APPROVED_WAITING";
    case "SUBMITTED": return sendFailed ? "SEND_FAILED" : "SENDING";
    default: return null;
  }
}
