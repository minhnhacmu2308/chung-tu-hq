import { PROGRESS_ORDER, type ProgressCode } from "@kb/contracts";
import type { CustomsChannel, Dossier } from "@/mocks/types";
import { progressOfDossier } from "./dossier-progress-badge";

/** Tab "việc cần làm" của danh sách hồ sơ (`?viec=`), spec trang-thai-ho-so §4.3. */
export const VIEC_TABS = ["all", "todo", "await-official", "channelled", "cleared", "attention"] as const;
export type Viec = (typeof VIEC_TABS)[number];

const TAB_PROGRESS: Record<Exclude<Viec, "all" | "attention">, readonly ProgressCode[]> = {
  todo: ["NOT_DECLARED"],
  "await-official": ["PRE_DECLARED", "AMEND_PRE_DECLARED"],
  channelled: ["DECLARED", "AMEND_RECALLED", "AMENDED"],
  cleared: ["CLEARED", "POST_AMENDED"],
};

export const parseViec = (raw: string | null): Viec => (VIEC_TABS as readonly string[]).includes(raw ?? "") ? (raw as Viec) : "all";

/** Lọc luồng trong tab "Đã phân luồng" (`?luong=`); vắng/không hợp lệ = mọi luồng. */
export type ChannelFilter = "ALL" | CustomsChannel;
export const parseChannel = (raw: string | null): ChannelFilter => (raw === "GREEN" || raw === "YELLOW" || raw === "RED" ? raw : "ALL");

/** Hồ sơ có thuộc tab không. `attention` = có cờ lỗi hoặc bị từ chối. */
export function inViec(d: Pick<Dossier, "status" | "customs">, viec: Viec): boolean {
  if (viec === "all") return true;
  const p = progressOfDossier(d);
  if (viec === "attention") return p.flags.length > 0 || p.progress === "REJECTED";
  return TAB_PROGRESS[viec].includes(p.progress);
}

/** Luồng của hồ sơ (để lọc thêm trong tab "Đã phân luồng"). */
export const channelOfDossier = (d: Pick<Dossier, "status" | "customs">): CustomsChannel | null => progressOfDossier(d).channel;

/** Mọi tiến độ có thể hiện trong bộ lọc cột Trạng thái. */
export const PROGRESS_FILTER_ORDER: readonly ProgressCode[] = [...PROGRESS_ORDER, "CANCELLED", "REJECTED", "DOSSIER_CANCELLED"];
