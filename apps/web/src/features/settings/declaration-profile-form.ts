// Logic thuần của form Mặc định khai báo (Cài đặt → Khai báo): ô theo chiều NK/XK, danh sách mã, kiểm giá trị.
import {
  CUSTOMS_OFFICES, INVOICE_KINDS, PAYMENT_METHODS, PRICE_KINDS, TRANSPORT_MODES, TYPE_CODES_NK, TYPE_CODES_XK,
  type CodeEntry, type DeclarationDirection, type DeclarationProfileInput, type FieldOverride, type ProfileFieldCode,
} from "@kb/contracts";

export type ProfileField = { code: ProfileFieldCode; label: string; hint?: string; placeholder?: string; options?: { value: string; label: string }[]; short?: boolean };

/** Giá trị lưu đúng dạng hiển thị trên tờ khai: "mã – tên". */
const opts = (list: CodeEntry[]) => list.map((c) => ({ value: `${c.code} – ${c.label}`, label: `${c.code} – ${c.label}` }));

const ALL: (ProfileField & { directions: DeclarationDirection[] })[] = [
  { code: "MA_LH", label: "Mã loại hình", hint: "Điền sẵn khi tạo hồ sơ", directions: ["NK", "XK"] },
  { code: "CQHQ", label: "Chi cục Hải quan", hint: "Điền sẵn khi tạo hồ sơ", options: opts(CUSTOMS_OFFICES), directions: ["NK", "XK"] },
  { code: "PTVC", label: "Phương thức vận chuyển", options: opts(TRANSPORT_MODES), directions: ["NK", "XK"] },
  { code: "KHO", label: "Mã địa điểm lưu kho mặc định", hint: "Dùng khi Arrival Notice không ghi kho (chỉ tiêu 1.29)", placeholder: "03CCS01 – Kho CFS Tân Vũ", short: true, directions: ["NK", "XK"] },
  { code: "PT_TT", label: "Phương thức thanh toán", hint: "Dùng khi hóa đơn/hợp đồng không ghi", options: opts(PAYMENT_METHODS), directions: ["NK", "XK"] },
  { code: "KHAI_TG", label: "Mã phân loại khai trị giá", placeholder: "6 – Áp dụng phương pháp trị giá giao dịch", directions: ["NK"] },
  { code: "NGUOI_NT", label: "Người nộp thuế", placeholder: "1 – Người nhập khẩu", directions: ["NK"] },
  { code: "PL_CN", label: "Mã phân loại cá nhân/tổ chức", placeholder: "4 – Tổ chức gửi tổ chức", directions: ["NK"] },
  { code: "HD_PL", label: "Phân loại hình thức hóa đơn", options: opts(INVOICE_KINDS), directions: ["NK"] },
  { code: "GIA_PL", label: "Mã phân loại giá hóa đơn", options: opts(PRICE_KINDS), directions: ["NK", "XK"] },
];

export function profileFieldsFor(direction: DeclarationDirection): ProfileField[] {
  return ALL.filter((f) => f.directions.includes(direction)).map(({ directions: _d, ...f }) => (f.code === "MA_LH" ? { ...f, options: opts(direction === "NK" ? TYPE_CODES_NK : TYPE_CODES_XK) } : f));
}

export type ProfileValues = Partial<Record<ProfileFieldCode, string>>;
export type ProfileErrors = Partial<Record<ProfileFieldCode, string>>;

const codePart = (v: string) => v.split(/\s+[–-]\s+/)[0]!.trim();

/** Kiểm nhanh phía giao diện (máy chủ kiểm lại theo catalog Phụ lục II). */
export function validateProfileForm(_direction: DeclarationDirection, values: ProfileValues): ProfileErrors {
  const errors: ProfileErrors = {};
  const kho = values.KHO?.trim();
  if (kho && codePart(kho).length > 7) errors.KHO = "Mã kho tối đa 7 ký tự";
  return errors;
}

export function toProfileInput(values: ProfileValues, overrides: Record<string, FieldOverride>): DeclarationProfileInput {
  return { values: Object.fromEntries(Object.entries(values).map(([k, v]) => [k, (v ?? "").trim()]).filter(([, v]) => v)), overrides };
}

/** Nguồn chọn sẵn trong hộp đổi nguồn: theo ghi đè đã lưu, bỏ nguồn không còn được phép; chưa ghi đè nguồn → mọi nguồn. */
export function initialPickedSources(rule: { sources: { id: string }[] }, current: FieldOverride | undefined): string[] {
  const all = rule.sources.map((s) => s.id);
  if (!current || !("sources" in current)) return all;
  return current.sources.filter((id) => all.includes(id));
}
