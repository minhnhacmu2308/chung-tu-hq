// Phản hồi KVGS của FPT → KvgsSheet (ADR 0014). Chấp nhận key camelCase .NET (`cargoControlNo`, `tK_SOTK`) hoặc HOA (`CARGO_CONTROL_NO`):
// so khớp không phân biệt hoa thường và bỏ ký tự không phải chữ/số.
import { KvgsSheetSchema, type KvgsSheet } from "@kb/contracts";
import { reasonError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";

type Obj = Record<string, unknown>;

/**
 * TẠM THỜI: đặc tả phản hồi KVGS của FPT CHƯA có (chủ sản phẩm sẽ cung cấp – xem docs/adr/0014-kvgs-container-list-and-barcode-print.md).
 * Tên trường dưới đây là phỏng đoán; khi có đặc tả chỉ sửa bảng này. Đây là NƠI DUY NHẤT khai báo bí danh tên trường.
 */
export const KVGS_FIELD_ALIASES = {
  regionOffice: ["regionOffice", "chiCucKhuVuc", "teN_CCKV"],
  customsOffice: ["customsOffice", "haiQuanCuaKhau", "teN_HQCK"],
  supervisionOffice: ["supervisionOffice", "chiCucGiamSat", "teN_CCGS"],
  sealRequired: ["sealRequired", "phaiNiemPhong", "niemPhong", "cO_NIEM_PHONG"],
  companyName: ["companyName", "teN_DV"],
  taxCode: ["taxCode", "mA_DV"],
  declarationNo: ["declarationNo", "tK_SOTK"],
  declarationStatus: ["declarationStatus", "tK_TRANGTHAI", "trangThaiToKhai"],
  declarationDate: ["declarationDate", "tK_NGAYDK"],
  declarationDateTo: ["declarationDateTo", "tK_NGAYDK_DEN", "ngayDenToKhai"],
  typeName: ["typeName", "teN_LH", "tenLoaiHinh"],
  channel: ["channel", "luongToKhai", "tK_LUONG"],
  cargoControlNo: ["cargoControlNo", "sO_QUAN_LY", "soQuanLyHangHoa"],
  barcode: ["barcode", "mA_VACH"],
  exportedAt: ["exportedAt", "ngaY_KET_XUAT", "ketXuatLuc"],
  containers: ["containers", "danH_SACH_CONT", "hanG_CONT", "dsContainer"],
  containerNo: ["containerNo", "coN_SO", "soContainer"],
  sealNo: ["sealNo", "seL_SO", "soSeal"],
  customsSealNo: ["customsSealNo", "seL_HQ", "soSealHaiQuan"],
  cargo: ["cargo", "hanG_LE", "hangLe"],
  quantity: ["quantity", "sO_LUONG", "soLuong"],
  quantityUnit: ["quantityUnit", "sO_LUONG_DVT", "soLuongDvt"],
  grossWeight: ["grossWeight", "trongLuong", "tronG_LUONG"],
  weightUnit: ["weightUnit", "tronG_LUONG_DVT", "trongLuongDvt"],
} as const;
type Field = keyof typeof KVGS_FIELD_ALIASES;

const norm = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, "");
const get = (o: Obj, f: Field): unknown => {
  const wanted = new Set(KVGS_FIELD_ALIASES[f].map(norm));
  const key = Object.keys(o).find((k) => wanted.has(norm(k)));
  return key === undefined ? undefined : o[key];
};
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const bool = (v: unknown): boolean => v === true || (typeof v === "number" && v === 1) || (typeof v === "string" && ["1", "true", "y", "yes", "c", "co"].includes(v.trim().toLowerCase()));
/** `dd/MM/yyyy` (có thể kèm giờ) hoặc `YYYY-MM-DD…` → `YYYY-MM-DD`; không hiểu → "". */
const isoDate = (v: unknown): string => {
  const s = str(v);
  const vn = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s);
  if (vn) return `${vn[3]}-${vn[2]}-${vn[1]}`;
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  return iso ? iso[1]! : "";
};
const nullableStr = (v: unknown): string | null => str(v) || null;

const incomplete = (missing: string[]) => err(reasonError("GATEWAY_ERROR", "KVGS_RESPONSE_INCOMPLETE", undefined, { missing }));

/** `now` = thời điểm kết xuất khi phản hồi không có. Thiếu số quản lý / số tờ khai / (container: ≥ 1 dòng, hàng lẻ: số lượng) → KVGS_RESPONSE_INCOMPLETE. */
export function mapKvgsResponse(raw: unknown, kind: "CONTAINER" | "CARGO", now: Date = new Date()): Result<KvgsSheet> {
  if (!isObj(raw)) return incomplete(["response"]);
  const missing: string[] = [];
  const cargoControlNo = str(get(raw, "cargoControlNo"));
  const declarationNo = str(get(raw, "declarationNo"));
  if (!cargoControlNo) missing.push("cargoControlNo");
  if (!declarationNo) missing.push("declarationNo");

  const rawContainers = get(raw, "containers");
  const containers = (Array.isArray(rawContainers) ? rawContainers : []).filter(isObj).map((c) => ({
    containerNo: str(get(c, "containerNo")),
    sealNo: nullableStr(get(c, "sealNo")),
    customsSealNo: nullableStr(get(c, "customsSealNo")),
    barcode: str(get(c, "barcode")),
  })).filter((c) => c.containerNo);
  if (kind === "CONTAINER" && containers.length === 0) missing.push("containers");

  const cargoSrc = get(raw, "cargo");
  const cargoObj = isObj(cargoSrc) ? cargoSrc : raw;
  const quantity = str(get(cargoObj, "quantity"));
  const cargo = quantity ? { quantity, quantityUnit: str(get(cargoObj, "quantityUnit")), grossWeight: str(get(cargoObj, "grossWeight")), weightUnit: str(get(cargoObj, "weightUnit")) } : null;
  if (kind === "CARGO" && !cargo) missing.push("cargo");

  if (missing.length) return incomplete(missing);
  const exportedAt = str(get(raw, "exportedAt"));
  const parsed = KvgsSheetSchema.safeParse({
    kind,
    regionOffice: str(get(raw, "regionOffice")), customsOffice: str(get(raw, "customsOffice")), supervisionOffice: str(get(raw, "supervisionOffice")),
    sealRequired: bool(get(raw, "sealRequired")), companyName: str(get(raw, "companyName")), taxCode: str(get(raw, "taxCode")),
    declarationNo, declarationStatus: str(get(raw, "declarationStatus")),
    declarationDate: isoDate(get(raw, "declarationDate")), declarationDateTo: isoDate(get(raw, "declarationDateTo")) || null,
    typeName: str(get(raw, "typeName")), channel: str(get(raw, "channel")), cargoControlNo, barcode: nullableStr(get(raw, "barcode")),
    containers: kind === "CONTAINER" ? containers : [], cargo: kind === "CARGO" ? cargo : null,
    exportedAt: Number.isNaN(Date.parse(exportedAt)) ? now.toISOString() : new Date(exportedAt).toISOString(),
  });
  if (!parsed.success) return incomplete(parsed.error.issues.map((i) => i.path.join(".")));
  return ok(parsed.data);
}
