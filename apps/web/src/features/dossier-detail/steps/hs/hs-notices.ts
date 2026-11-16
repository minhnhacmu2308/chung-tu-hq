// Cảnh báo phân loại HS → lưu ý gọn (NoticeChip): nhãn theo `code`, màu theo `level`, cột theo `group`; lưu ý lặp trên nhiều dòng
// gom lên đầu bảng. Dữ liệu cũ / HSCodePro cũ chỉ có `warnings` (câu chữ) → đoán mã theo đầu câu, gộp như bản mới.
import type { HsWarningDetail, LineItem } from "@kb/contracts";
import { FTA_MISSING_AGREEMENT, LEGACY, LEGAL_REF, MINISTRY_SHORT, POLICY_MINISTRY, POLICY_PREFIX } from "./hs-notices.vi";

export type Notice = HsWarningDetail;
export type NoticeGroup = Notice["group"];

/** Mã gộp được khi lặp trên một dòng (nhiều bản ghi cùng Bộ, 2 câu kỳ FTA). */
const MERGEABLE = new Set(["SPECIALIZED_POLICY", "FTA_LAST_PERIOD"]);

function legacyNotice(text: string): Notice {
  const hit = LEGACY.find(([re]) => re.test(text))?.[1] ?? { code: "OTHER", level: "warning" as const, group: "classification" as const };
  const params: Record<string, string> = {};
  if (hit.code === "SPECIALIZED_POLICY") {
    const ministry = POLICY_MINISTRY.exec(text)?.[1];
    if (ministry) params.ministry = ministry;
  }
  if (hit.code === "LOW_CONFIDENCE") params.pct = /\((\d+)%\)/.exec(text)?.[1] ?? "";
  if (hit.code === "INVOICE_HS_MISMATCH") params.invoiceHs = /\(([^)]+)\)/.exec(text)?.[1] ?? "";
  if (hit.code === "FTA_RATE_MISSING") params.agreement = FTA_MISSING_AGREEMENT.exec(text)?.[1] ?? "";
  return { ...hit, text, ...(Object.keys(params).length ? { params } : {}), ...(MERGEABLE.has(hit.code) ? { items: [text] } : {}) };
}

function mergeRepeated(list: Notice[]): Notice[] {
  const out: Notice[] = [];
  for (const n of list) {
    const same = MERGEABLE.has(n.code) ? out.find((o) => o.code === n.code && o.params?.ministry === n.params?.ministry) : undefined;
    if (!same) out.push(n);
    else {
      same.items = [...new Set([...(same.items ?? [same.text]), ...(n.items ?? [n.text])])];
      same.text = same.items.join(" ");
    }
  }
  return out;
}

/** Lưu ý của một dòng: bản có cấu trúc + câu cũ chưa có trong đó; dòng đã xác nhận có VAT cần xét điều kiện → thêm lưu ý VAT. */
export function lineNotices(item: Pick<LineItem, "hs" | "hsConfirmed" | "vatCertain" | "vatNote">): Notice[] {
  const details = (item.hs?.warningDetails ?? []).map((d) => ({ ...d }));
  const covered = new Set(details.map((d) => d.text));
  const list = mergeRepeated([...details, ...(item.hs?.warnings ?? []).filter((w) => !covered.has(w)).map(legacyNotice)]);
  if (item.hsConfirmed && item.vatCertain === false && item.vatNote && !list.some((n) => n.code === "VAT_CONDITIONAL")) {
    list.push({ code: "VAT_CONDITIONAL", level: "info", group: "tax", text: item.vatNote, items: [item.vatNote] });
  }
  return list;
}

export type SharedNotice = { notice: Notice; lines: number[] };

/**
 * Lưu ý giống hệt (cùng mã + nội dung) trên ≥ 2 dòng → gom lên đầu bảng, các dòng không hiện lại. Lưu ý mức `danger` luôn ở lại dòng
 * (phải xử lý từng dòng).
 */
export function splitShared(items: Array<Pick<LineItem, "id" | "lineNo" | "hs" | "hsConfirmed" | "vatCertain" | "vatNote">>): { shared: SharedNotice[]; perLine: Map<string, Notice[]> } {
  const notices = new Map(items.map((it) => [it.id, lineNotices(it)]));
  const key = (n: Notice) => `${n.code}|${n.text}`;
  const lines = new Map<string, SharedNotice>();
  for (const it of items) {
    for (const n of notices.get(it.id)!) {
      if (n.level === "danger") continue;
      const s = lines.get(key(n)) ?? { notice: n, lines: [] };
      if (!s.lines.includes(it.lineNo)) s.lines.push(it.lineNo);
      lines.set(key(n), s);
    }
  }
  const shared = [...lines.values()].filter((s) => s.lines.length >= 2).map((s) => ({ ...s, lines: s.lines.sort((a, b) => a - b) }));
  const hoisted = new Set(shared.map((s) => key(s.notice)));
  const perLine = new Map([...notices].map(([id, list]) => [id, list.filter((n) => !hoisted.has(key(n)))]));
  return { shared, perLine };
}

/** "1, 2, 3, 5" → "1–3, 5". */
export function lineRanges(lines: number[]): string {
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    let j = i;
    while (j + 1 < lines.length && lines[j + 1] === lines[j]! + 1) j++;
    out.push(j - i >= 2 ? `${lines[i]}–${lines[j]}` : lines.slice(i, j + 1).join(", "));
    i = j;
  }
  return out.join(", ");
}

export const ministryShort = (m: string) => MINISTRY_SHORT[m] ?? m;

/**
 * Câu quản lý chuyên ngành (dữ liệu nguồn: "…: Động vật thân mềm …| Bạch tuộc (Octopus spp.):/ - Đông lạnh – Luật Thú y, - Nghị định …")
 * → mục chính + văn bản căn cứ. Bỏ đầu "Quản lý chuyên ngành (Bộ …):" (đã có ở tiêu đề thẻ).
 */
export function policyItem(text: string): { text: string; refs: string[] } {
  const body = text.replace(POLICY_PREFIX, "");
  const [head = "", ...rest] = body.split(/\s+[–-]\s+/);
  const main = [head.replace(/\s*\|\s*/g, " · ").replace(/[:/\s]+$/, "")];
  const refs: string[] = [];
  for (const part of rest.map((p) => p.replace(/[\s,;.]+$/, "").trim()).filter(Boolean)) (LEGAL_REF.test(part) ? refs : main).push(part);
  return { text: main.join(" – "), refs: [...new Set(refs)] };
}
