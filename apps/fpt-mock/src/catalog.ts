// Danh mục tối thiểu để dựng các trường FPT tự tính. Mục có trong response thật ghi "(mẫu thật)"; còn lại là số giả.

/** Tỷ giá tính thuế (VND). USD lấy từ response thật 14/10/2026; tiền khác là số giả gần thực tế. */
export const EXCHANGE_RATES: Record<string, string> = {
  USD: "25720", // (mẫu thật)
  EUR: "28150", JPY: "172.5", CNY: "3560", KRW: "18.9", SGD: "19850", THB: "760", HKD: "3290", TWD: "820", AUD: "16900", GBP: "33800", VND: "1",
};

/** TK_CH → TK_K08 (tên viết tắt Chi cục). */
export const CUSTOMS_OFFICE_NAMES: Record<string, string> = {
  "88AB": "CCHQTN", // (mẫu thật)
};

/** TK_ST → TK_K42 (tên địa điểm lưu kho). */
export const WAREHOUSE_NAMES: Record<string, string> = {
  "27PCC81": "CTY KIM GIANG", // (mẫu thật)
};
