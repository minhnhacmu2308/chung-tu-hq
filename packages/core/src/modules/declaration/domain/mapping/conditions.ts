// Điều kiện xuất hiện của chỉ tiêu "theo tình huống" (Phụ lục II TT39/2018 sửa đổi TT121/2025). Thuần, dùng cho FieldMapping.when.
// Loại hình theo bảng mã loại hình của Cục Hải quan (code-tables.ts): G11–G14 tạm nhập, G51 tái nhập, G21–G24 tái xuất, G61 tạm xuất.
import { transportModeCode } from "../catalog-resolve.js";
import type { FieldMapping, MappingInput } from "./types.js";

type When = NonNullable<FieldMapping["when"]>;
const type = (i: MappingInput) => i.dossier.typeCode.trim().toUpperCase();
/** Mã phương thức vận chuyển chỉ tiêu 1.6/2.6 (1 không, 2 biển container, 3 biển rời, 4 bộ, 5 sắt, 6 sông, 9 khác). */
export const transportCode = (i: MappingInput) => transportModeCode(i.dossier.transportMode, i.shipment.transport.containers.length > 0).code;

/** 1.10 thời hạn tái xuất – loại hình tạm nhập. */
export const TEMP_IMPORT: When = { label: "Loại hình tạm nhập (G11–G14)", test: (i) => /^G1[1-4]$/.test(type(i)) };
/** 1.3 số tờ khai tạm xuất tương ứng – tái nhập hàng đã tạm xuất. */
export const RE_IMPORT: When = { label: "Loại hình tái nhập hàng đã tạm xuất (G51)", test: (i) => type(i) === "G51" };
/** 2.3 số tờ khai tạm nhập tương ứng – tái xuất hàng đã tạm nhập. */
export const RE_EXPORT: When = { label: "Loại hình tái xuất hàng đã tạm nhập (G21–G24)", test: (i) => /^G2[1-4]$/.test(type(i)) };
/** 2.7 thời hạn tái nhập – loại hình tạm xuất. */
export const TEMP_EXPORT: When = { label: "Loại hình tạm xuất (G61)", test: (i) => type(i) === "G61" };
/** 1.31 / 2.30 ô 1 hô hiệu – vận chuyển đường biển hoặc đường sông. */
export const BY_WATER: When = { label: "Vận chuyển đường biển / đường sông (mã 2, 3, 6)", test: (i) => ["2", "3", "6"].includes(transportCode(i)) };
/** 1.35 số lượng container / 2.60 số container – hàng đóng container đi đường biển. */
export const IN_CONTAINER: When = { label: "Hàng container đường biển (mã 2)", test: (i) => transportCode(i) === "2" };
