// Lý do gợi ý từng loại chứng từ ở bước 2 (upload-slots.ts).
import { defineMessages } from "@kb/ui";

export const UPLOAD_SLOT_MESSAGES = defineMessages({
  vi: {
    invoice: "Trị giá, người bán/mua, dòng hàng",
    packingList: "Số kiện, trọng lượng – lô nhỏ có thể không có",
    airWaybill: "Số vận đơn, nơi xếp/dỡ",
    billOfLading: "Số vận đơn, tàu, cảng xếp/dỡ",
    freightByIncoterm: "Điều kiện {incoterm}: cần cước vận chuyển để cộng vào trị giá tính thuế",
    freightMaybe: "Khi giá EXW/FCA/FAS/FOB: cần cước vận chuyển để cộng vào trị giá tính thuế",
    certOfOrigin: "Chỉ cần khi hưởng thuế ưu đãi đặc biệt (FTA)",
  },
  en: {
    invoice: "Value, seller/buyer, line items",
    packingList: "Packages, weight – small shipments may not have one",
    airWaybill: "Bill of lading no., loading/unloading place",
    billOfLading: "Bill of lading no., vessel, loading/unloading port",
    freightByIncoterm: "Incoterm {incoterm}: freight is needed to add to the customs value",
    freightMaybe: "For EXW/FCA/FAS/FOB prices: freight is needed to add to the customs value",
    certOfOrigin: "Only needed for special preferential duty (FTA)",
  },
  zh: {
    invoice: "金额、买卖方、货物行",
    packingList: "件数、重量 – 小批量可能没有",
    airWaybill: "运单号、装/卸货地",
    billOfLading: "提单号、船名、装/卸货港",
    freightByIncoterm: "交货条件 {incoterm}：需要运费以计入完税价格",
    freightMaybe: "EXW/FCA/FAS/FOB 价格时：需要运费以计入完税价格",
    certOfOrigin: "仅在享受特别优惠关税（FTA）时需要",
  },
});
