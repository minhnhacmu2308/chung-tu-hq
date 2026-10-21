// Danh mục dùng ở form Tạo hồ sơ (prototype: cố định; bản thật lấy từ danh mục Hải quan).
import type { ComboboxOption, SelectOption } from "@kb/ui";
import type { DocKind, Direction, Dossier } from "@/mocks/types";

export const TYPE_CODES: Record<Direction, ComboboxOption[]> = {
  NK: [
    { value: "A11", label: "A11 – Nhập kinh doanh tiêu dùng", description: "Hàng hóa nhập khẩu kinh doanh tại chi cục cửa khẩu" },
    { value: "A12", label: "A12 – Nhập kinh doanh sản xuất", description: "Nhập kinh doanh làm thủ tục tại chi cục ngoài cửa khẩu" },
    { value: "A21", label: "A21 – Chuyển tiêu thụ nội địa từ nguồn tạm nhập" },
    { value: "A31", label: "A31 – Nhập hàng xuất khẩu bị trả lại" },
    { value: "A41", label: "A41 – Nhập kinh doanh của doanh nghiệp thực hiện quyền nhập khẩu" },
    { value: "E11", label: "E11 – Nhập nguyên liệu của DNCX từ nước ngoài" },
    { value: "E21", label: "E21 – Nhập nguyên liệu để gia công cho thương nhân nước ngoài" },
    { value: "E31", label: "E31 – Nhập nguyên liệu sản xuất xuất khẩu" },
    { value: "E41", label: "E41 – Nhập sản phẩm thuê gia công ở nước ngoài" },
    { value: "G11", label: "G11 – Tạm nhập hàng kinh doanh tạm nhập tái xuất" },
    { value: "G12", label: "G12 – Tạm nhập máy móc, thiết bị phục vụ dự án có thời hạn" },
    { value: "G13", label: "G13 – Tạm nhập miễn thuế" },
  ],
  XK: [
    { value: "B11", label: "B11 – Xuất kinh doanh", description: "Xuất khẩu hàng thương mại thông thường" },
    { value: "B12", label: "B12 – Xuất sau khi đã tạm xuất" },
    { value: "B13", label: "B13 – Xuất trả hàng đã nhập khẩu" },
    { value: "E42", label: "E42 – Xuất sản phẩm của DNCX" },
    { value: "E52", label: "E52 – Xuất sản phẩm gia công cho thương nhân nước ngoài" },
    { value: "E62", label: "E62 – Xuất sản phẩm sản xuất xuất khẩu" },
    { value: "G21", label: "G21 – Tái xuất hàng kinh doanh tạm nhập tái xuất" },
    { value: "G61", label: "G61 – Tạm xuất hàng hóa" },
  ],
};

/** Nhóm loại hình (như ô "Nhóm loại hình" đầu khối Tờ khai – APP_NHOM_LH): lọc danh sách mã loại hình. */
export type TypeGroup = "KD" | "SXXK" | "GC" | "CX";
export const TYPE_GROUPS: { value: TypeGroup; label: string }[] = [
  { value: "KD", label: "Kinh doanh" },
  { value: "SXXK", label: "Sản xuất xuất khẩu" },
  { value: "GC", label: "Gia công" },
  { value: "CX", label: "Chế xuất" },
];
const GROUP_OF: Record<string, TypeGroup> = { E11: "CX", E42: "CX", E21: "GC", E41: "GC", E52: "GC", E31: "SXXK", E62: "SXXK" };
/** Nhóm của mã loại hình; mã không thuộc loại hình E (kinh doanh, tạm nhập tái xuất…) → Kinh doanh. */
export const typeGroupOf = (code: string | null): TypeGroup => (code && GROUP_OF[code]) || "KD";
export const typeCodesIn = (direction: Direction, group: TypeGroup): ComboboxOption[] =>
  TYPE_CODES[direction].filter((o) => typeGroupOf(o.value) === group);

export const CUSTOMS_OFFICES: ComboboxOption[] = [
  { value: "03CE", label: "03CE – Chi cục HQ CK cảng Hải Phòng KV III", description: "Cảng Đình Vũ, Tân Vũ, Nam Hải" },
  { value: "03CC", label: "03CC – Chi cục HQ CK cảng Hải Phòng KV I", description: "Cảng Hoàng Diệu, Chùa Vẽ" },
  { value: "03EE", label: "03EE – Chi cục HQ CK cảng Hải Phòng KV II" },
  { value: "03TG", label: "03TG – Chi cục HQ KCX và KCN Hải Phòng" },
  { value: "01B1", label: "01B1 – Chi cục HQ CK sân bay quốc tế Nội Bài", description: "Hàng hóa nhập khẩu đường hàng không" },
  { value: "01B3", label: "01B3 – Chi cục HQ CK sân bay quốc tế Nội Bài (xuất)" },
  { value: "01PR", label: "01PR – Chi cục HQ Bắc Hà Nội" },
  { value: "18A3", label: "18A3 – Chi cục HQ Bắc Ninh" },
  { value: "02CI", label: "02CI – Chi cục HQ CK cảng Sài Gòn KV I", description: "Cảng Cát Lái" },
  { value: "02CX", label: "02CX – Chi cục HQ CK cảng Sài Gòn KV IV" },
  { value: "02B1", label: "02B1 – Chi cục HQ CK sân bay quốc tế Tân Sơn Nhất" },
  { value: "43IH", label: "43IH – Chi cục HQ KCN Sóng Thần (Bình Dương)" },
  { value: "47NG", label: "47NG – Chi cục HQ Nhơn Trạch (Đồng Nai)" },
  { value: "34CE", label: "34CE – Chi cục HQ CK cảng Đà Nẵng" },
  { value: "51CB", label: "51CB – Chi cục HQ CK cảng Cái Mép (Bà Rịa – Vũng Tàu)" },
  { value: "15SI", label: "15SI – Chi cục HQ CK quốc tế Lào Cai" },
];

export const INCOTERMS: SelectOption[] = ["EXW", "FCA", "FAS", "FOB", "CFR", "CIF", "CPT", "CIP", "DAP", "DPU", "DDP"].map((v) => ({
  value: v,
  label: v,
}));

/** Incoterm mà cước/bảo hiểm quốc tế chưa nằm trong giá → phải cộng vào trị giá tính thuế (NK). */
export const FREIGHT_NOT_INCLUDED = new Set(["EXW", "FCA", "FAS", "FOB"]);

export const SKILL_SETS: SelectOption[] = [
  { value: "default", label: "Mặc định doanh nghiệp" },
  { value: "supplier-hansol", label: "Theo nhà cung cấp – HANSOL PRECISION" },
  { value: "supplier-artemide", label: "Theo nhà cung cấp – ARTEMIDE (EU, REX)" },
];

export type SuggestedDoc = { kind: DocKind; name: string; note: string; important?: boolean };

/** Danh sách chứng từ gợi ý theo loại hồ sơ. Chỉ là gợi ý – không chặn khi thiếu (PRODUCT.md bước 1). */
export function suggestedDocuments(direction: Direction, mode: Dossier["transportMode"], incoterm: string): SuggestedDoc[] {
  const docs: SuggestedDoc[] = [
    { kind: "INVOICE", name: "Commercial Invoice", note: "Trị giá, điều kiện giao hàng, người bán/mua", important: true },
    { kind: "PACKING_LIST", name: "Packing List", note: "Số kiện, trọng lượng – lô nhỏ có thể không có" },
  ];
  if (mode === "SEA_CONTAINER") docs.push({ kind: "BILL_OF_LADING", name: "Bill of Lading", note: "Số vận đơn, cảng xếp/dỡ, số container/seal", important: true });
  if (mode === "SEA_BULK") docs.push({ kind: "BILL_OF_LADING", name: "Bill of Lading", note: "Số vận đơn, cảng xếp/dỡ, tên tàu – hàng rời/lỏng không có container", important: true });
  if (mode === "AIR") docs.push({ kind: "AIR_WAYBILL", name: "Air Waybill (MAWB/HAWB)", note: "Số vận đơn, sân bay, số kiện", important: true });
  if (mode === "ROAD") docs.push({ kind: "OTHER", name: "Chứng từ vận tải đường bộ", note: "CMR / phiếu giao hàng, biển số xe" });
  if (mode === "RAIL") docs.push({ kind: "OTHER", name: "Vận đơn đường sắt", note: "Railway bill (SMGS/CIM), số toa" });
  if (mode === "RIVER") docs.push({ kind: "OTHER", name: "Vận đơn đường sông", note: "Số vận đơn, tên sà lan/phương tiện thủy nội địa" });
  if (mode === "OTHER") docs.push({ kind: "OTHER", name: "Chứng từ vận tải", note: "Chứng từ chứng minh việc giao hàng (nếu có)" });
  if (direction === "NK") {
    docs.push({ kind: "ARRIVAL_NOTICE", name: "Arrival Notice", note: "Ngày hàng đến, phí local, cước (nếu có)" });
    if (FREIGHT_NOT_INCLUDED.has(incoterm)) {
      docs.push({ kind: "FREIGHT_INVOICE", name: "Hóa đơn cước quốc tế", note: `${incoterm}: cước phải cộng vào trị giá tính thuế`, important: true });
    }
    docs.push({ kind: "CERT_OF_ORIGIN", name: "C/O hoặc chứng từ tự chứng nhận xuất xứ", note: "Để hưởng thuế suất ưu đãi FTA (form E, AK, VK, REX…)" });
  }
  docs.push({ kind: "SALES_CONTRACT", name: "Sales Contract", note: "Không bắt buộc – dùng đối chiếu điều khoản" });
  return docs;
}
