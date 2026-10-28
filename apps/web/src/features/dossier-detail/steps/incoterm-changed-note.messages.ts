import { defineMessages } from "@kb/ui";

export const INCOTERM_CHANGED_MESSAGES = defineMessages({
  vi: {
    title: "Điều kiện giao hàng đã đổi {from} → {to}",
    body: "Máy đọc “{original}” trên chứng từ; người khai sửa thành “{value}”. Kiểm tra lại với hóa đơn / hợp đồng – điều kiện giao hàng quyết định cước có cộng vào trị giá tính thuế hay không.",
    bodyBy: "Máy đọc “{original}” trên chứng từ; {who} sửa thành “{value}” lúc {at}. Kiểm tra lại với hóa đơn / hợp đồng – điều kiện giao hàng quyết định cước có cộng vào trị giá tính thuế hay không.",
    reason: "Lý do giữ điều kiện này dù vận đơn ghi người nhận trả cước: {reason}",
  },
  en: {
    title: "Incoterm changed {from} → {to}",
    body: "The documents were read as “{original}”; the declarant changed it to “{value}”. Check it against the invoice / contract – the incoterm decides whether freight is added to the dutiable value.",
    bodyBy: "The documents were read as “{original}”; {who} changed it to “{value}” at {at}. Check it against the invoice / contract – the incoterm decides whether freight is added to the dutiable value.",
    reason: "Reason for keeping it although the bill of lading says the consignee pays freight: {reason}",
  },
  zh: {
    title: "贸易术语已更改 {from} → {to}",
    body: "单证识别结果为“{original}”，申报人改为“{value}”。请对照发票 / 合同核查 – 贸易术语决定运费是否计入完税价格。",
    bodyBy: "单证识别结果为“{original}”，{who} 于 {at} 改为“{value}”。请对照发票 / 合同核查 – 贸易术语决定运费是否计入完税价格。",
    reason: "尽管提单注明收货人支付运费，仍保留该术语的原因：{reason}",
  },
});
