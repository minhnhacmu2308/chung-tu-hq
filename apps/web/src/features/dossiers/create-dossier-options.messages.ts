import { defineMessages } from "@kb/ui";

export const TYPE_GROUP_LABELS = defineMessages({
  vi: { KD: "Kinh doanh", SXXK: "Sản xuất xuất khẩu", GC: "Gia công", CX: "Chế xuất" },
  en: { KD: "Trading", SXXK: "Export production", GC: "Processing", CX: "Export processing" },
  zh: { KD: "经营", SXXK: "出口生产", GC: "加工", CX: "出口加工" },
});

export const SKILL_SET_LABELS = defineMessages({
  vi: { default: "Mặc định doanh nghiệp", bySupplier: "Theo nhà cung cấp" },
  en: { default: "Organization default", bySupplier: "By supplier" },
  zh: { default: "企业默认", bySupplier: "按供应商" },
});

/** Chứng từ gợi ý khi tạo hồ sơ. Tên chứng từ quốc tế (Commercial Invoice…) giữ tiếng Anh ở mọi ngôn ngữ. */
export const SUGGESTED_DOC_MESSAGES = defineMessages({
  vi: {
    invoiceNote: "Trị giá, điều kiện giao hàng, người bán/mua",
    packingNote: "Số kiện, trọng lượng – lô nhỏ có thể không có",
    blContainerNote: "Số vận đơn, cảng xếp/dỡ, số container/seal",
    blBulkNote: "Số vận đơn, cảng xếp/dỡ, tên tàu – hàng rời/lỏng không có container",
    awbNote: "Số vận đơn, sân bay, số kiện",
    roadName: "Chứng từ vận tải đường bộ", roadNote: "CMR / phiếu giao hàng, biển số xe",
    railName: "Vận đơn đường sắt", railNote: "Railway bill (SMGS/CIM), số toa",
    riverName: "Vận đơn đường sông", riverNote: "Số vận đơn, tên sà lan/phương tiện thủy nội địa",
    otherName: "Chứng từ vận tải", otherNote: "Chứng từ chứng minh việc giao hàng (nếu có)",
    arrivalNote: "Ngày hàng đến, phí local, cước (nếu có)",
    freightName: "Hóa đơn cước quốc tế", freightNote: "Khi giá EXW/FCA/FAS/FOB: cước phải cộng vào trị giá tính thuế",
    coName: "C/O hoặc chứng từ tự chứng nhận xuất xứ", coNote: "Để hưởng thuế suất ưu đãi FTA (form E, AK, VK, REX…)",
    contractNote: "Không bắt buộc – dùng đối chiếu điều khoản",
  },
  en: {
    invoiceNote: "Value, delivery terms, seller/buyer",
    packingNote: "Packages, weight – small shipments may not have one",
    blContainerNote: "B/L number, loading/discharge ports, container/seal numbers",
    blBulkNote: "B/L number, loading/discharge ports, vessel – bulk/liquid cargo without containers",
    awbNote: "AWB number, airports, packages",
    roadName: "Road transport document", roadNote: "CMR / delivery note, vehicle plate",
    railName: "Rail waybill", railNote: "Railway bill (SMGS/CIM), wagon number",
    riverName: "River waybill", riverNote: "Waybill number, barge/inland vessel name",
    otherName: "Transport document", otherNote: "Proof of delivery (if any)",
    arrivalNote: "Arrival date, local charges, freight (if any)",
    freightName: "International freight invoice", freightNote: "For EXW/FCA/FAS/FOB prices: freight must be added to the customs value",
    coName: "C/O or origin self-certification", coNote: "To claim FTA preferential rates (form E, AK, VK, REX…)",
    contractNote: "Optional – used to cross-check terms",
  },
  zh: {
    invoiceNote: "金额、交货条件、买卖双方",
    packingNote: "件数、重量 – 小批量可能没有",
    blContainerNote: "提单号、装卸港、集装箱/封条号",
    blBulkNote: "提单号、装卸港、船名 – 散货/液货无集装箱",
    awbNote: "运单号、机场、件数",
    roadName: "公路运输单证", roadNote: "CMR / 送货单、车牌号",
    railName: "铁路运单", railNote: "Railway bill（SMGS/CIM）、车厢号",
    riverName: "内河运单", riverNote: "运单号、驳船/内河船舶名称",
    otherName: "运输单证", otherNote: "交货证明单证（如有）",
    arrivalNote: "到货日期、本地费用、运费（如有）",
    freightName: "国际运费发票", freightNote: "EXW/FCA/FAS/FOB 价格时：运费须计入完税价格",
    coName: "C/O 或原产地自主声明", coNote: "用于享受 FTA 优惠税率（E、AK、VK、REX 表格…）",
    contractNote: "非必需 – 用于核对条款",
  },
});
