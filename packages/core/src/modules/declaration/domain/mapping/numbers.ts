// Số chỉ tiêu Phụ lục II (TT39/2018, sửa đổi TT121/2025) cho từng mnemonic – đối chiếu với catalog @kb/contracts/declaration (test kiểm tra tồn tại).
// Lưu ý: mã phân loại giá, điều kiện giá, mã tiền và tổng trị giá hóa đơn là 4 ô con của cùng chỉ tiêu 1.44 / 2.39.
// Mẫu 01 – tờ khai nhập khẩu (IDA).
export const IDA_NO = {
  SOTK: "1.1", MA_LH: "1.4", PTVC: "1.6", PL_CN: "1.7", CQHQ: "1.8", NGAY_DK: "1.11",
  NNK_MST: "1.12", NNK_TEN: "1.13", NNK_DC: "1.15", NNK_DT: "1.16",
  NXK_TEN: "1.20", NXK_DC: "1.22", MA_NUOC: "1.23",
  SO_VD: "1.26", SO_KIEN: "1.27", TRONG_LUONG: "1.28", KHO: "1.29", PTVC_TEN: "1.31", NGAY_DEN: "1.32", CANG_DO: "1.33", CANG_XEP: "1.34",
  VBPQ: "1.37", HD_PL: "1.39", SO_HD: "1.41", NGAY_HD: "1.42", PT_TT: "1.43", GIA_PL: "1.44", DK_GIA: "1.44", MA_TT: "1.44", TONG_TG: "1.44", KHAI_TG: "1.45",
  PHI_VC: "1.47", PHI_BH: "1.48", KHOAN_DC: "1.49", NGUOI_NT: "1.52", GHI_CHU: "1.68", SO_QLNB: "1.69",
} as const;

// Mẫu 02 – tờ khai xuất khẩu (EDA). Không có chỉ tiêu phân loại cá nhân/tổ chức, khai trị giá, phí vận chuyển/bảo hiểm.
export const EDA_NO = {
  SOTK: "2.1", MA_LH: "2.4", PTVC: "2.6", CQHQ: "2.8", NGAY_DK: "2.10",
  NXK_MST: "2.11", NXK_TEN: "2.12", NXK_DC: "2.14", NXK_DT: "2.15",
  NNK_TEN: "2.19", NNK_DC: "2.21", MA_NUOC: "2.22",
  SO_VD: "2.24", SO_KIEN: "2.25", TRONG_LUONG: "2.26", KHO: "2.27", CANG_DO: "2.28", CANG_XEP: "2.29", PTVC_TEN: "2.30", NGAY_DI: "2.31",
  HD_PL: "2.34", SO_HD: "2.36", NGAY_HD: "2.37", PT_TT: "2.38", GIA_PL: "2.39", DK_GIA: "2.39", MA_TT: "2.39", TONG_TG: "2.39",
  GHI_CHU: "2.57", SO_QLNB: "2.58",
} as const;
