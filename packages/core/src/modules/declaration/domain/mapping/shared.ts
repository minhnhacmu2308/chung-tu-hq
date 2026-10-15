// Chỉ tiêu có cùng cách xác định ở Mẫu 01 (IDA) và Mẫu 02 (EDA) – Phụ lục II TT39/2018 sửa đổi TT121/2025. Thuần.
import { dec } from "../../../../shared/decimal.js";
import { incotermCode, isIncotermCode } from "../adjustments.js";
import { resolvePackageUnit, resolvePayment, resolvePort } from "../catalog-resolve.js";
// Suy từ chứng từ (không có/nhiều hóa đơn, dòng FOC, phương thức thanh toán trên invoice) luôn thắng; chứng từ không cho tín hiệu riêng
// thì dùng Mặc định khai báo của doanh nghiệp (profileOr). Ghi đè nguồn/giá trị cố định của doanh nghiệp vẫn chạy trước (evaluateMapping).
import { fixed, fromSourced, missing, profileOr, type MappedValue, type MappingInput } from "./types.js";

type Kind = "IDA" | "EDA";

export const port = (raw: string | null, pick: ReturnType<typeof resolvePort>, source: MappedValue["source"]): MappedValue =>
  pick ? { value: `${pick.code} – ${pick.name}`, source } : raw ? { value: raw, source, suspect: true, note: `Không tìm thấy mã VNACCS cho “${raw}” – chọn mã địa điểm` } : missing(source, "Chưa có địa điểm trên chứng từ");

const invoiceCount = (i: MappingInput) => i.shipment.documents.filter((d) => d.kind === "INVOICE").length;
/** Dòng hàng không phải trả tiền (FOC): trị giá dòng = 0. */
const focLines = (i: MappingInput) => i.shipment.items.filter((it) => it.amount.value !== null && dec(it.amount.value).isZero()).map((it) => it.lineNo);

/** 1.39 / 2.34 – Phân loại hình thức hóa đơn: A hóa đơn thương mại; B bảng kê nhiều hóa đơn hoặc không có hóa đơn (không có mã C). */
export function invoiceKind(i: MappingInput, kind: Kind): MappedValue {
  const n = invoiceCount(i);
  const no = kind === "IDA" ? "1.39" : "2.34";
  if (n === 0) return { value: "B – Không có hóa đơn thương mại", source: "SYSTEM", suspect: true, note: `Hồ sơ chưa có hóa đơn: khai B và để trống số hóa đơn; nếu có hóa đơn thì tải lên (chỉ tiêu ${no})` };
  if (n > 1) return { value: "B – Bảng kê hóa đơn (nhiều hóa đơn)", source: "SYSTEM", suspect: true, note: `Có ${n} hóa đơn: khai B, số hóa đơn là số bảng kê/hóa đơn tổng, đính kèm danh sách hóa đơn qua HYS (chỉ tiêu ${no})` };
  return profileOr(i, "HD_PL", fixed("A – Hóa đơn thương mại", "INVOICE"));
}

/** 1.44 ô 1 / 2.39 ô 4 – Mã phân loại giá hóa đơn: A phải trả tiền, B toàn bộ FOC, C có cả hai; không có hóa đơn → IDA D, EDA không khai. */
export function priceKind(i: MappingInput, kind: Kind): MappedValue {
  if (invoiceCount(i) === 0) return kind === "IDA" ? { value: "D – Các trường hợp khác (không có hóa đơn)", source: "SYSTEM" } : { value: null, source: "SYSTEM", note: "Không có hóa đơn – không khai mã phân loại giá (chỉ tiêu 2.39)" };
  const foc = focLines(i);
  if (foc.length && foc.length === i.shipment.items.length) return { value: "B – Giá hóa đơn cho hàng hóa không phải trả tiền", source: "INVOICE", note: "Toàn bộ dòng hàng có trị giá 0 (FOC)" };
  if (foc.length) {
    const where = kind === "IDA" ? "chi tiết khai trị giá (1.50)" : "phần ghi chú (2.57)";
    return { value: "C – Gồm hàng phải trả tiền và không phải trả tiền", source: "INVOICE", suspect: true, note: `Dòng ${foc.join(", ")} có trị giá 0 (FOC): ghi số thứ tự các dòng này vào ${where}${kind === "IDA" ? " và nhập trị giá tính thuế từng dòng (1.87)" : ""}` };
  }
  return profileOr(i, "GIA_PL", fixed("A – Giá hóa đơn cho hàng hóa phải trả tiền", "INVOICE"));
}

/** 1.43 / 2.38 – Phương thức thanh toán (xem resolvePayment: T/T thường là KC, không phải TTR). Chứng từ không ghi → Mặc định khai báo. */
export function paymentMethod(i: MappingInput, kind: Kind): MappedValue {
  const raw = i.shipment.invoice.paymentTerms;
  const r = resolvePayment(raw.value);
  if (!r) return profileOr(i, "PT_TT", missing("CONTRACT", kind === "IDA" ? "Chưa có phương thức thanh toán trên invoice / hợp đồng" : "Chưa có phương thức thanh toán"));
  const base = fromSourced(raw, "CONTRACT");
  const note = [base.note, r.note].filter(Boolean).join(". ");
  return { ...base, value: `${r.code} – ${r.name}`, ...(r.suspect || base.suspect ? { suspect: true } : {}), ...(note ? { note } : {}) };
}

/** 1.44 ô 2 / 2.39 ô 1 – Điều kiện giao hàng: chỉ mã (bỏ địa danh). TT121 thêm DPU cho Mẫu 01; Mẫu 02 không có DPU. */
export function incotermField(i: MappingInput, kind: Kind): MappedValue {
  const s = i.shipment.invoice.incoterm;
  const v = fromSourced(s, "INVOICE", (x) => incotermCode(x));
  if (v.value === null) return v;
  if (!isIncotermCode(v.value, kind)) {
    const why = kind === "EDA" && v.value === "DPU" ? "Mẫu 02 (chỉ tiêu 2.39) không có mã DPU" : `“${s.value}” không có trong bảng mã điều kiện giao hàng`;
    return { ...v, suspect: true, note: `${why} – chọn mã đúng theo hợp đồng` };
  }
  if (v.value === "DPU") return { ...v, note: "Nếu phần mềm khai chưa nhận DPU: khai DAT và ghi DPU ở chi tiết khai trị giá 1.50 (TT121)" };
  return v;
}

/** 1.27 / 2.25 – Số lượng kiện (số nguyên) + mã loại kiện. */
export function packageCount(i: MappingInput, missingNote: string): MappedValue {
  const p = fromSourced(i.shipment.transport.packages, "PACKING_LIST");
  if (p.value === null) return missing("PACKING_LIST", missingNote);
  const rawUnit = i.shipment.transport.packageUnit.value;
  const u = resolvePackageUnit(rawUnit);
  const value = `${p.value.replace(/\.0+$/, "")} ${u?.code ?? "PK"}`;
  if (!u) return { ...p, value, suspect: true, note: "Chứng từ không ghi loại kiện – tạm khai PK, chọn mã loại kiện đúng" };
  if (u.guessed) return { ...p, value, suspect: true, note: `Không nhận ra loại kiện “${rawUnit}” – tạm khai PK, chọn mã loại kiện đúng` };
  return { ...p, value };
}

/** HS từng dòng để xét chính sách: ưu tiên mã đã xác nhận (biểu VN), chưa có thì mã trên invoice. */
export const lineHs = (i: MappingInput) =>
  i.shipment.items.map((it) => (i.lines.find((l) => l.lineNo === it.lineNo)?.hsConfirmed ?? it.hsOnInvoice.value ?? "").replace(/\D/g, ""));
