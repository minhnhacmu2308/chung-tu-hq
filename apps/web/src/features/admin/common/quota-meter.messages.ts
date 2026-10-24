import { defineMessages } from "@kb/ui";

export const QUOTA_METER_MESSAGES = defineMessages({
  vi: { dossiers: " hồ sơ", aria: "Đã dùng {percent}% hạn mức hồ sơ – {label}", bonus: "Gồm {n} hồ sơ nới tạm trong tháng này." },
  en: { dossiers: " dossiers", aria: "{percent}% of dossier quota used – {label}", bonus: "Includes {n} temporary extra dossiers this month." },
  zh: { dossiers: " 份档案", aria: "已使用 {percent}% 档案额度 – {label}", bonus: "含本月临时增加的 {n} 份档案。" },
});
