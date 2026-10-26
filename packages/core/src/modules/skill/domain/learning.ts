// Skill tự học từ việc kiểm tra chứng từ: nhận ra cùng nhà cung cấp, chuẩn hóa nhãn in trên chứng từ, chọn ví dụ gửi AI. Thuần.
import type { DocKind, SkillField } from "@kb/contracts";

/** Từ chung của tên công ty – bỏ khi so nhà cung cấp ("ABC CO., LTD" và "XYZ CO., LTD" không phải một). */
const COMPANY_WORDS = new Set([
  "CO", "LTD", "LIMITED", "COMPANY", "CORP", "CORPORATION", "INC", "JSC", "LLC", "GMBH", "PTE", "PLC", "SA", "AG", "BV",
  "TNHH", "CONG", "TY", "CP", "MTV", "THE", "AND", "OF",
]);

/** Bỏ dấu tiếng Việt (kể cả đ – NFD không tách). */
const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").replace(/[\u0111\u0110]/g, "d").toUpperCase();

export function supplierTokens(name: string): Set<string> {
  return new Set(
    fold(name)
      .replace(/[^A-Z0-9]+/g, " ")
      .split(" ")
      .filter((w) => w.length > 1 && !COMPANY_WORDS.has(w)),
  );
}

/** Cùng một nhà cung cấp: mọi từ riêng của tên ngắn hơn có trong tên dài hơn (tên trên skill thường ngắn gọn hơn trên chứng từ). */
export function sameSupplier(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const ta = supplierTokens(a);
  const tb = supplierTokens(b);
  if (!ta.size || !tb.size) return false;
  const [small, big] = ta.size <= tb.size ? [ta, tb] : [tb, ta];
  for (const w of small) if (!big.has(w)) return false;
  return true;
}

/** Nhãn in trên chứng từ → alias: bỏ dấu ":" / "-" thừa ở cuối, gộp khoảng trắng; phải có chữ, 2–60 ký tự. */
export function normalizeAlias(label: string): string | null {
  const s = label.replace(/\s+/g, " ").replace(/[\s:：\-–=]+$/u, "").replace(/^[\s:：\-–]+/u, "").trim();
  if (s.length < 2 || s.length > 60 || !/\p{L}/u.test(s)) return null;
  return s;
}

const aliasKey = (s: string) => fold(s).replace(/[^A-Z0-9]+/g, "");

/** Trường đã có nhãn này (so bỏ dấu, bỏ ký tự ngăn cách) – hoặc nhãn chính là tên trường. */
export function hasAlias(field: SkillField, alias: string): boolean {
  const k = aliasKey(alias);
  return !k || aliasKey(field.label) === k || field.aliases.some((a) => aliasKey(a) === k);
}

/** Ví dụ gửi kèm AI: mẫu đã gắn nhãn của cùng nhà cung cấp trước, rồi mẫu mới nhất. */
export function pickExamples<T extends { status: string; expected: unknown; supplier?: string | null; createdAt: Date }>(samples: T[], supplierHint: string | null, n = 2): T[] {
  const labeled = samples.filter((s) => s.status === "LABELED" && s.expected).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const same = supplierHint ? labeled.filter((s) => sameSupplier(s.supplier, supplierHint)) : [];
  return [...same, ...labeled.filter((s) => !same.includes(s))].slice(0, n);
}

/** Sau bấy nhiêu chứng từ bị sửa của cùng nhà cung cấp → tự tạo skill riêng cho nhà cung cấp đó. */
export const AUTO_SUPPLIER_SKILL_AFTER = 2;
/** Tối đa mẫu tự học mỗi skill (mẫu nhiều hơn không giúp thêm mà làm đánh giá chậm/tốn). */
export const MAX_REVIEW_SAMPLES = 60;

const KIND_NAME: Record<DocKind, string> = {
  INVOICE: "Commercial Invoice", PACKING_LIST: "Packing List", BILL_OF_LADING: "Bill of Lading", AIR_WAYBILL: "Air Waybill", CERT_OF_ORIGIN: "C/O",
  SALES_CONTRACT: "Hợp đồng", ARRIVAL_NOTICE: "Arrival Notice", FREIGHT_INVOICE: "Hóa đơn cước", OTHER: "Chứng từ",
};

/** Tên skill tự tạo cho nhà cung cấp: "Commercial Invoice – HANSOL PRECISION CO., LTD". */
export const supplierSkillName = (kind: DocKind, supplier: string) => `${KIND_NAME[kind]} – ${supplier}`.slice(0, 120);
