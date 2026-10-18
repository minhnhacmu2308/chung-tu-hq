// Điều kiện xuất hiện của chỉ tiêu "theo tình huống" (Phụ lục II TT39/2018 sửa đổi TT121/2025) – MỘT nguồn cho backend (mapping)
// và giao diện (bố cục tờ khai). Loại hình theo bảng mã của Cục Hải quan: G11–G14 tạm nhập, G51 tái nhập, G21–G24 tái xuất, G61 tạm xuất.

export type ConditionId = "TEMP_IMPORT" | "RE_IMPORT" | "RE_EXPORT" | "TEMP_EXPORT" | "BY_WATER" | "IN_CONTAINER" | "EXPORT_VALUE" | "AIR_IDENT" | "HAS_HAWB" | "SPLIT_CONTAINER" | "MANUAL_VALUE";

/**
 * Dữ liệu tối thiểu để xét điều kiện: mã loại hình, mã phương thức vận chuyển (1.6/2.6), điều kiện giá, có hóa đơn hay không.
 * Ô riêng của phần mềm (không gửi VNACCS, backend không cần): khai định danh theo đường biển/hàng không, có phát hành HAWB, loại hàng khi tách vận đơn.
 */
export type ConditionContext = {
  typeCode: string; transportCode: string; incoterm: string; hasInvoice: boolean;
  identMode?: string; hawbIssued?: boolean; splitCargo?: string;
  /** Dòng hàng chọn tự nhập trị giá tính thuế. */
  manualValue?: boolean;
};

const type = (c: ConditionContext) => c.typeCode.trim().toUpperCase();

export const DECLARATION_CONDITIONS: Record<ConditionId, { label: string; test: (c: ConditionContext) => boolean }> = {
  /** 1.10 thời hạn tái xuất. */
  TEMP_IMPORT: { label: "Loại hình tạm nhập (G11–G14)", test: (c) => /^G1[1-4]$/.test(type(c)) },
  /** 1.3 số tờ khai tạm xuất tương ứng. */
  RE_IMPORT: { label: "Loại hình tái nhập hàng đã tạm xuất (G51)", test: (c) => type(c) === "G51" },
  /** 2.3 số tờ khai tạm nhập tương ứng. */
  RE_EXPORT: { label: "Loại hình tái xuất hàng đã tạm nhập (G21–G24)", test: (c) => /^G2[1-4]$/.test(type(c)) },
  /** 2.7 thời hạn tái nhập. */
  TEMP_EXPORT: { label: "Loại hình tạm xuất (G61)", test: (c) => type(c) === "G61" },
  /** 1.31 / 2.30 ô 1 hô hiệu. */
  BY_WATER: { label: "Vận chuyển đường biển / đường sông (mã 2, 3, 6)", test: (c) => ["2", "3", "6"].includes(c.transportCode.trim()) },
  /** 1.35 số lượng container / 2.59–2.60 container. */
  IN_CONTAINER: { label: "Hàng container đường biển (mã 2)", test: (c) => c.transportCode.trim() === "2" },
  /** 2.40 trị giá tính thuế xuất khẩu. */
  EXPORT_VALUE: { label: "Điều kiện giá khác FOB/DAP/DAF hoặc không có hóa đơn", test: (c) => !["FOB", "DAP", "DAF"].includes(c.incoterm.trim().toUpperCase()) || !c.hasInvoice },
  /** Vận đơn: hỏi "có phát hành HAWB" khi khai định danh theo hàng không. */
  AIR_IDENT: { label: "Khai báo định danh theo đường hàng không", test: (c) => c.identMode === "HANG_KHONG" },
  /** Vận đơn: ô số HAWB cạnh từng số vận đơn. */
  HAS_HAWB: { label: "Đường hàng không, có phát hành HAWB", test: (c) => c.identMode === "HANG_KHONG" && c.hawbIssued === true },
  /** Tách vận đơn: số lượng container và danh sách container của vận đơn nhánh. */
  SPLIT_CONTAINER: { label: "Tách vận đơn hàng container", test: (c) => c.splitCargo === "1" },
  /** Dòng hàng: trị giá tính thuế phân bổ thủ công chỉ nhập khi chọn tự nhập. */
  MANUAL_VALUE: { label: "Chọn tự nhập trị giá tính thuế (Manual)", test: (c) => c.manualValue === true },
};
