import { defineMessages } from "@kb/ui";

/** Lượt khai / hợp đồng ở bước Truyền tờ khai (ADR 0011 §6.2). `usesLine`: "{n}" được tô đậm (số lượt). */
export const SUBMIT_BILLING_MESSAGES = defineMessages({
  vi: {
    usesLine: "Lô này dùng {n} khi Hải quan chấp nhận khai chính thức · còn {available} lượt khả dụng",
    credits: "{n} lượt", creditsOne: "{n} lượt",
    insufficientTitle: "Không đủ lượt để truyền tờ khai",
    insufficientBody: "Lô này cần {needed} lượt, còn {available} lượt khả dụng. Mua thêm lượt rồi gửi lại – lượt chỉ bị trừ khi Hải quan chấp nhận khai chính thức.",
    buyCredits: "Mua lượt",
    expiredTitle: "Hợp đồng đã hết hạn",
    expiredBody: "Đã quá 7 ngày ân hạn (hết hạn ngày {date}) – chưa truyền được tờ khai mới. Liên hệ gia hạn hợp đồng để tiếp tục.",
    graceTitle: "Hợp đồng đang trong thời gian ân hạn",
    graceBody: "Hợp đồng đã hết hạn ngày {date}. Vẫn truyền được trong 7 ngày ân hạn – liên hệ gia hạn ngay.",
    viewPlan: "Xem gói",
  },
  en: {
    usesLine: "This lot uses {n} when Customs accepts the official declaration · credits available: {available}",
    credits: "{n} credits", creditsOne: "{n} credit",
    insufficientTitle: "Not enough credits to submit",
    insufficientBody: "Credits needed for this lot: {needed} · available: {available}. Buy more credits and send again – credits are used only when Customs accepts the official declaration.",
    buyCredits: "Buy credits",
    expiredTitle: "Contract expired",
    expiredBody: "The 7-day grace period has passed (ended {date}) – new declarations can't be submitted. Contact us to renew the contract.",
    graceTitle: "Contract in grace period",
    graceBody: "The contract ended on {date}. You can still submit during the 7-day grace period – contact us to renew now.",
    viewPlan: "View plan",
  },
  zh: {
    usesLine: "海关接受正式申报时本批将使用 {n} · 可用 {available} 次",
    credits: "{n} 次", creditsOne: "{n} 次",
    insufficientTitle: "次数不足，无法发送报关单",
    insufficientBody: "本批需要 {needed} 次，可用 {available} 次。请购买次数后重新发送——仅在海关接受正式申报时扣除。",
    buyCredits: "购买次数",
    expiredTitle: "合同已到期",
    expiredBody: "已超过 7 天宽限期（{date} 到期）——无法发送新的报关单。请联系续约。",
    graceTitle: "合同处于宽限期",
    graceBody: "合同已于 {date} 到期。7 天宽限期内仍可发送——请尽快联系续约。",
    viewPlan: "查看套餐",
  },
});
