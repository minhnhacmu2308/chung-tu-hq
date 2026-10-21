// Nhãn dòng nguồn tỷ giá tính thuế trên màn Review – dùng bởi rate-source.ts.
import { defineMessages } from "@kb/ui";

export const RATE_SOURCE_MESSAGES = defineMessages({
  vi: {
    noRate: "Ngày {date} · chưa có tỷ giá chính thức cho ngoại tệ này – quản trị nhập tay",
    week: "Tuần {from} – {to}",
    vcbAt: ", bảng lúc {time}",
    manual: "đội vận hành nhập tay",
    seed: "dữ liệu mẫu (chưa phải tỷ giá chính thức)",
    stale: " · ⚠ chưa có tỷ giá tuần {week} – đang dùng tỷ giá tuần trước, quản trị cần nhập/kiểm tra",
  },
  en: {
    noRate: "Date {date} · no official exchange rate for this currency yet – entered manually by admin",
    week: "Week {from} – {to}",
    vcbAt: ", table at {time}",
    manual: "entered manually by the operations team",
    seed: "sample data (not an official exchange rate)",
    stale: " · ⚠ no exchange rate for the week of {week} yet – using last week's rate; admin needs to enter/check it",
  },
  zh: {
    noRate: "日期 {date} · 该币种暂无官方汇率 – 由管理员手动录入",
    week: "{from} – {to} 当周",
    vcbAt: "，牌价时间 {time}",
    manual: "运营团队手动录入",
    seed: "示例数据（非官方汇率）",
    stale: " · ⚠ 暂无 {week} 当周汇率 – 正在使用上周汇率，需管理员录入/核对",
  },
});
