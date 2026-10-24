import { defineMessages } from "@kb/ui";

export const REASON_DIALOG_MESSAGES = defineMessages({
  vi: { reason: "Lý do", reasonRequired: "Nhập lý do", reasonMin: "Nhập lý do (ít nhất 5 ký tự)", reasonMax: "Lý do tối đa 500 ký tự", hint: "Ghi vào nhật ký quản trị – người khác đọc phải hiểu vì sao làm việc này.", cancel: "Hủy" },
  en: { reason: "Reason", reasonRequired: "Enter a reason", reasonMin: "Enter a reason (at least 5 characters)", reasonMax: "Reason must be at most 500 characters", hint: "Recorded in the admin audit log – others reading it must understand why this was done.", cancel: "Cancel" },
  zh: { reason: "原因", reasonRequired: "请输入原因", reasonMin: "请输入原因（至少 5 个字符）", reasonMax: "原因最多 500 个字符", hint: "将记入管理日志——他人阅读时应能明白为何执行此操作。", cancel: "取消" },
});
