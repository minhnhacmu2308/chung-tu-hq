// Giá trị người dùng gõ khi sửa trường → chuẩn hóa theo spec của đường dẫn (số bỏ dấu phẩy nghìn, ngày ISO, mã viết hoa…).
import { ITEM_SPECS, SHIPMENT_FIELDS } from "./shipment-spec.js";

/** undefined = không có spec (giữ nguyên); null = không hợp lệ; string = giá trị chuẩn. */
export function normalizeEdit(shipmentPath: string | null, raw: string): string | null | undefined {
  if (!shipmentPath) return undefined;
  const item = /^\/items\/\d+\/(\w+)$/.exec(shipmentPath);
  if (item) {
    const spec = ITEM_SPECS.find((s) => s.field === item[1]);
    return spec ? spec.normalize(raw) : undefined;
  }
  const spec = SHIPMENT_FIELDS.find((s) => s.path === shipmentPath);
  if (!spec) return undefined;
  const v = spec.normalize(raw);
  if (v === null) return null;
  return spec.valid && !spec.valid(v) ? null : v;
}

/** Hồ sơ đã duyệt/truyền/hủy không sửa dữ liệu đọc được. */
export const isReadLocked = (s: string | null) => s === "APPROVED" || s === "SUBMITTED" || s === "CLEARED" || s === "CANCELLED";
