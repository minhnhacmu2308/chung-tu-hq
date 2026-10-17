// Tờ khai nhập A44 (tạm nhập hàng bán tại cửa hàng miễn thuế), đường hàng không, luồng vàng – chép từ ảnh mẫu CHITIEU_NHAPKHAU.
import type { PrototypeFixture } from "./types";

const ITEM_HQ = {
  HAG_B36: "54464832", HAG_B50: "VND", HAG_KKT: "756456", HAG_KKS: "VND", HAG_B42: "A", HAG_B43: "45%", HAG_B47: "0", HAG_B49: "24509174.4", HAG_B56: "U KING",
  HAG_KQ3: "Thuế TTĐB", HAG_KS3: "54464832", HAG_LC3: "HANG NK DE BAN TAI CUA HANG MIEN THUE",
  HAG_KQ5: "Thuế GTGT", HAG_KS5: "54464832", HAG_LC5: "HANG TAM NHAP TAI XUAT, TAM XUAT TAI NHAP",
};

const DECLARED = {
  TK_ICN: "108700327851", TK_A09: "2026-10-08", TK_A06: "2", TK_A07: "HQ cửa khẩu sân bay quốc tế Tân Sơn Nhất", TK_A00: "2208", TK_B12: "3", TK_B13: "1",
  TK_TRANGTHAI: "C", TK_LUONG: "2", TK_THONGQUAN: "0", VD_A51: "KHO SCSC",
  THUE_KF1: "N", THUE_KG1: "Thuế NK", THUE_KH1: "0", THUE_KI1: "1", THUE_B02: "0", THUE_KJ1: "USD", THUE_KK1: "25800", TK_A86: "54464832", TK_B08: "A",
};

export const IDA_A44: PrototypeFixture = {
  code: "HS-NK-BAN-MAU-A44",
  declarant: {
    TK_ICB: "A44", TK_MTC: "1", TK_SKB: "4", TK_CH: "06B1", TK_CHB: "01", TK_ICD: "2026-10-08",
    TK_IMC: "0102325399", TK_IMN: "CÔNG TY CỔ PHẦN HÀNG KHÔNG VIETJET", TK_IMY: "(+84)43", TK_IMA: "302/3 phố Kim Mã, Phường Ngọc Hà, Thành phố Hà Nội, Việt Nam", TK_IMT: "08.35471866",
    TK_EPC: "94", TK_EPN: "DFASS SINGAPORE PTE. LTD", TK_EPA: "51 CHANGI BUSINESS PARK", TK_EP2: "CENTRAL 2", TK_EP3: "#09-14 THE SIGNATURE", TK_EP4: "SINGAPORE 486066", TK_EPO: "SG",
    APP_DD_PT: "HANG_KHONG", APP_HAWB_CO: "CO", VD_BL1: "61858265281", APP_NGAY_VD1: "2026-10-05", APP_HAWB1: "SGN26100512", VD_NO: "1", VD_NOT: "PK", VD_GW: "133", VD_GWT: "KGM", VD_MRK: "##12026##",
    VD_ST: "06B1A04", VD_DST: "VNSGN", VD_DSN: "HO CHI MINH", VD_PSC: "SGSIN", VD_PSN: "SINGAPORE", VD_VSN: "SQ0178/06OCT", VD_ARR: "2026-10-06", VD_ISD: "2026-10-08",
    TK_IV1: "A", TK_IV3: "VJA-136LQ", TK_IVD: "2026-10-02", TK_IVP: "TTR", TK_IP1: "A", TK_IP2: "C&F", TK_IP4: "2111.04", TK_IP3: "USD",
    KTG_VD1: "6", TK_TP: "2111.04", KTG_VLD: "05102026#&, Thời hạn lưu trữ hàng hóa không quá 12 tháng kể từ ngày hoàn thành thủ tục hải quan.", KTG_IN1: "D",
    TK_TPM: "1", TK_ENC: "D",
    TK_NT2: "#&ANNEXURE AI (01/09/2022), Tạm nhập hàng hóa bán tại cửa hàng miễn thuế Vietjet",
  },
  items: [
    {
      HAG_CMD: "22083090", HAG_MAHANG: "100347", HAG_CMN: "Rượu CHIVAS : CHIVAS XV 6/100/40 NRF GB, 1L (40%), dung tích 1 lít/chai, nồng độ cồn 40%, 100347. Hàng mới 100%",
      HAG_QN1: "72", HAG_QT1: "UNA", HAG_QN2: "72", HAG_QT2: "LTR", HAG_BPR: "2111.04", HAG_UPR: "29.32", HAG_UPC: "USD", HAG_TSC: "UNA",
      HAG_OR: "GB", HAG_ORS: "B01", HAG_RE: "XN180", HAG_TX3: "TB020", HAG_TR3: "TK060", HAG_TX5: "VB245", HAG_TR5: "VK110",
    },
  ],
  customsByStage: {
    "da-khai": { header: DECLARED, items: [ITEM_HQ] },
    "thong-quan": { header: { ...DECLARED, TK_THONGQUAN: "1", TK_C21: "2026-10-09", TK_AD4: "10:15:00", TK_C20: "Chi cục trưởng (mẫu)", TK_C22: "2026-10-09", TK_AD5: "09:40:00" }, items: [ITEM_HQ] },
  },
  messages: [
    { code: "VAD0LA0", name: "Khai báo tờ khai nhập khẩu (IDA)", at: "2026-10-08T01:20:00.000Z" },
    { code: "VAD1AC0", name: "Đăng ký tờ khai nhập khẩu (IDC) – luồng vàng", at: "2026-10-08T01:32:00.000Z" },
    { code: "VAS0LA0", name: "Tham chiếu tờ khai – đã thông quan", at: "2026-10-09T03:15:00.000Z" },
  ],
};
