// Nhãn mã phân loại kiểm tra (luồng xanh/vàng/đỏ) – dùng bởi customs-info-view.ts.
import { defineMessages } from "@kb/ui";

export const INSPECTION_MESSAGES = defineMessages({
  vi: {
    "1": "Luồng xanh – miễn kiểm tra hồ sơ và thực tế hàng",
    "2": "Luồng vàng – kiểm tra hồ sơ",
    "3": "Luồng đỏ – kiểm tra hồ sơ và thực tế hàng",
  },
  en: {
    "1": "Green channel – no document or physical inspection",
    "2": "Yellow channel – document inspection",
    "3": "Red channel – document and physical inspection",
  },
  zh: {
    "1": "绿色通道 – 免审单证、免查验货物",
    "2": "黄色通道 – 审核单证",
    "3": "红色通道 – 审核单证并查验货物",
  },
});
