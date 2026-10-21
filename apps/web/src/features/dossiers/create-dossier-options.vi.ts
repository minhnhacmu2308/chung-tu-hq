// Danh mục chi cục Hải quan – tên chính thức tiếng Việt. Nhãn này được GỬI BACKEND làm `customsOffice` khi tạo hồ sơ
// (create-dossier-page) → không dịch, giữ nguyên ở mọi ngôn ngữ giao diện.
import type { ComboboxOption } from "@kb/ui";

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
