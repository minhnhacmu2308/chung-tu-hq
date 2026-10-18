// Tờ khai xuất B13 (xuất khẩu hàng đã nhập khẩu), đường hàng không, luồng đỏ, 5 dòng – chép từ ảnh mẫu CHITIEU_XUATKHAU
// (dòng 1 đúng ảnh; dòng 2–5 bổ sung cho đủ tổng trị giá hóa đơn 4.566,17 USD).
import { toMinor } from "@/lib/decimal";
import type { FormValues } from "../form-state";
import type { PrototypeFixture } from "./types";

const RATE = 25890;
const line = (cmd: string, cmn: string, qty: string, unit: string, price: string, amount: string): FormValues => ({
  HAG_CMD: cmd, HAG_CMN: cmn, HAG_QN1: qty, HAG_QT1: unit, HAG_QN2: qty, HAG_QT2: unit, HAG_BPR: amount, HAG_UPR: price, HAG_UPC: "USD", HAG_TSC: unit, HAG_RE: "XN180",
  // Ô xuất xứ của phần mềm khớp mã nước ghi sau "#&" trong mô tả (2.69).
  APP_XUAT_XU: /#&([A-Z]{2})$/.exec(cmn)?.[1] ?? "",
});
const ITEMS: FormValues[] = [
  { ...line("33049930", "Bộ Sản Phẩm Dưỡng Da Du Lịch Almora Botanica Travel Essentials Must Have Kit Set 15ml, gồm 15ml dầu dưỡng và dụng cụ mát-xa bằng đá, 167948. Mới 100%#&CN", "70", "SET", "24.8", "1736"), HAG_MAHANG: "167948" },
  line("33049990", "Sữa dưỡng thể du lịch 50ml, 168020. Mới 100%#&KR", "30", "PCE", "31.5", "945"),
  line("33030000", "Nước hoa 30ml, 168115. Mới 100%#&FR", "12", "PCE", "58.25", "699"),
  line("34011100", "Xà phòng thơm 100g, 168204. Mới 100%#&TH", "50", "PCE", "9.8", "490"),
  line("33059000", "Bộ dầu gội và xả du lịch, 168311. Mới 100%#&KR", "1", "SET", "696.17", "696.17"),
];
const itemHq = (it: FormValues): FormValues => {
  // Tính trên đơn vị nhỏ (xu) rồi làm tròn tới đồng, như mock trị giá của app (lib/decimal).
  const vnd = Math.round((toMinor(it["HAG_BPR"] ?? "0") * RATE) / 100);
  return { HAG_R07: String(vnd), HAG_ADB: "VND", HAG_CVU: String(Math.round(vnd / toMinor(it["HAG_QN1"] ?? "1", 0))), HAG_ADA: "VND", HAG_QCV: it["HAG_QT1"] ?? "", HAG_TRA: "0%", HAG_TAX: "0" };
};

const DECLARED: FormValues = {
  TK_ECN: "308918349961", TK_K10: "2026-09-04", TK_K07: "3", TK_K08: "HQ cửa khẩu sân bay quốc tế Tân Sơn Nhất", TK_K01: "3304", TK_K69: "5", TK_K70: "5",
  TK_TRANGTHAI: "C", TK_LUONG: "3", TK_THONGQUAN: "0", TK_K42: "KHO SCSC",
  TK_ETA: "0", TK_AD7: "VND", TK_RC1: "USD", TK_RD1: String(RATE), TK_PAY: "A",
};

export const EDA_B13: PrototypeFixture = {
  code: "HS-XK-BAN-MAU-B13",
  declarant: {
    APP_NHOM_LH: "KD", TK_ECB: "B13", TK_MTC: "1", TK_CH: "06B1", TK_CHB: "05", TK_ECD: "2026-09-04",
    TK_EPC: "0102325399", TK_EPN: "CÔNG TY CỔ PHẦN HÀNG KHÔNG VIETJET", TK_EPP: "(+84)43", TK_EPA: "302/3 phố Kim Mã, Phường Ngọc Hà, Thành phố Hà Nội, Việt Nam", TK_EPT: "08.35471866",
    TK_CGN: "DFASS SINGAPORE PTE LTD", TK_CGP: "(+84)43", TK_CGA: "51 CHANGI BUSINESS PARK CENTRAL 2", TK_CAT: "#09-14 THE SIGNATURE", TK_CAS: "SINGAPORE 486066", TK_CGK: "SG",
    TK_EKN: "122600046825044", TK_NO: "1", TK_NOT: "PK", TK_GW: "156", TK_GWT: "KGM", TK_MRK: "TK CHUNG KIEN/KG:308917724750/61630/91030,",
    TK_ST: "06B1A04", TK_DSC: "SGSIN", TK_DSN: "SINGAPORE", TK_PSC: "VNSGN", TK_PSN: "HO CHI MINH", TK_VSN: "CX0764/12SEP", TK_SYM: "2026-09-12",
    TK_DPD: "2026-09-04", TK_ARP: "06B1A04", TK_ADT: "2026-09-04",
    TK_IV1: "A", TK_IV3: "VJC-DFS-2026-03F-NDG", TK_IVD: "2026-09-04", TK_IVP: "KC", TK_IP1: "A", TK_IP2: "DDU", TK_IP4: "4566.17", TK_IP3: "USD",
    TK_FCD: "USD", TK_FKK: "4566.17", TK_TP: "4566.17",
    TK_TPM: "1", TK_ENC: "D",
    TK_NT2: "#&TKTN: 107284900661 (20/06/2024), Công văn gia hạn số: 899/CKTSN-GSKS ngày 21/05/2026",
  },
  items: ITEMS,
  customsByStage: {
    "da-khai": { header: DECLARED, items: ITEMS.map(itemHq) },
    "thong-quan": { header: { ...DECLARED, TK_THONGQUAN: "1", TK_K86: "2026-09-05", TK_AD5: "14:05:00", TK_K87: "Chi cục trưởng (mẫu)", TK_CCD: "2026-09-05", TK_AD4: "11:30:00" }, items: ITEMS.map(itemHq) },
  },
  messages: [
    { code: "VAE0LA0", name: "Khai báo tờ khai xuất khẩu (EDA)", at: "2026-09-04T02:00:00.000Z" },
    { code: "VAE1LF0", name: "Đăng ký tờ khai xuất khẩu (EDC) – luồng đỏ", at: "2026-09-04T02:12:00.000Z" },
    { code: "VAS0LA0", name: "Tham chiếu tờ khai – đã thông quan", at: "2026-09-05T07:05:00.000Z" },
  ],
};
