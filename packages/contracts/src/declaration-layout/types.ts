import type { CodeTable } from "../declaration/catalog-types.js";
import type { ConditionId } from "../declaration/conditions.js";

/**
 * Bố cục tờ khai đầy đủ chỉ tiêu (bản mẫu giao diện – docs/superpowers/specs/2026-10-17-to-khai-day-du-ban-mau-design.md).
 * Dữ liệu thuần: khóa ô = tên trường VNACCS (TK_IMC, VD_BL2, HAG_TX3…); ô không có trong đặc tả dùng tiền tố APP_.
 * Vai trò/hướng dẫn tra từ catalog Phụ lục II theo số chỉ tiêu (`no` của ô, hoặc của nhóm chứa ô).
 */
/** choice: chọn một trong `options` (ô riêng của phần mềm, mã trạng thái của nghiệp vụ). */
export type FieldInput = "text" | "code" | "date" | "time" | "number" | "textarea" | "choice";
/** `short` / `full`: chữ viết tắt của lựa chọn và ý nghĩa hiện khi bấm (short-labels.ts). */
export type FieldOption = { value: string; label: string; description?: string; short?: string; full?: string };
/** DECLARANT: người khai nhập; CUSTOMS: Hải quan cấp/tính, chỉ đọc. */
export type FieldOrigin = "DECLARANT" | "CUSTOMS";

export type LayoutField = {
  kind: "field";
  key: string;
  label: string;
  /** Số chỉ tiêu Phụ lục II (ô con trong nhóm thường để trống, dùng số của nhóm). */
  no?: string;
  input: FieldInput;
  width?: "xs" | "sm" | "md" | "lg" | "full";
  codeTable?: CodeTable;
  origin?: FieldOrigin;
  condition?: ConditionId;
  options?: FieldOption[];
  /** Ô bắt buộc theo đặc tả nghiệp vụ không có trong Phụ lục II (định danh, tách vận đơn). */
  required?: boolean;
  /** Chữ viết tắt khi tên dài làm vỡ lưới form (vd "Mã PLHH") – giao diện hiện chữ này, bấm vào xem tên đầy đủ. Gắn ở short-labels.ts. */
  short?: string;
  /** Ý nghĩa hiện khi bấm chữ viết tắt; không có → hiện `label`. */
  full?: string;
  /** Chỉ hiện ô chọn kèm chữ của lựa chọn (nhãn chỉ cho trình đọc màn hình), không nút ⓘ – HAWB: "Có phát hành HAWB". */
  hideLabel?: boolean;
};
/** Chỉ tiêu nhiều ô con nằm ngang (địa chỉ 4 dòng, tổng trị giá 4 ô…). */
export type LayoutGroup = {
  kind: "group"; label: string; no?: string; condition?: ConditionId; fields: LayoutField[];
  /** "any": các ô con là lựa chọn thay thế – nhập một ô là đủ chỉ tiêu (2.59 địa điểm đóng hàng: 5 mã hoặc tên/địa chỉ). */
  fill?: "any";
};
/** Nhóm lặp: key chứa "{n}" (1..count) hoặc "{nn}" (01..count); mỗi dòng = các ô của `fields`. */
export type LayoutRepeat = { kind: "repeat"; label: string; no?: string; count: number; condition?: ConditionId; fields: LayoutField[] };
export type LayoutItem = LayoutField | LayoutGroup | LayoutRepeat;

export type LayoutBlock = {
  id: string;
  title: string;
  condition?: ConditionId;
  items: LayoutItem[];
  /** Khối Hải quan trả về: câu hiện khi chưa có dữ liệu ("Có sau khi …"). */
  emptyNote?: string;
  /** Thao tác của phần mềm trên khối (chép số container từ tờ khai khác…) – chỉ hiện khi đang sửa. */
  actions?: { id: string; label: string }[];
};
export type LayoutSection = { id: string; title: string; blocks: LayoutBlock[] };

export type DeclarationLayout = {
  kind: "IDA" | "EDA";
  /** Ô Hải quan trả về hiện ở đầu trang (số tờ khai, phân luồng, thông quan, ngày đăng ký). */
  summary: LayoutField[];
  /** Tab "Người khai nhập", nhóm 1–7 (nhóm 8 = dòng hàng). */
  declarant: LayoutSection[];
  /** Tab "Hải quan trả về". */
  customs: LayoutSection[];
  /** Dòng hàng: cột ở bảng, phần người khai nhập, phần Hải quan tính. */
  item: { columns: string[]; declarant: LayoutBlock[]; customs: LayoutBlock[] };
};
