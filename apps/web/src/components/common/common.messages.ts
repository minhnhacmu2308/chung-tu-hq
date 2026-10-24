import { defineMessages } from "@kb/ui";

export const DOCUMENT_PREVIEW_MESSAGES = defineMessages({
  vi: { originalLabel: "Chứng từ gốc: {kind} – {file}" },
  en: { originalLabel: "Original document: {kind} – {file}" },
  zh: { originalLabel: "原始单证：{kind} – {file}" },
});

export const LOAD_ERROR_MESSAGES = defineMessages({
  vi: { title: "Không tải được dữ liệu", retry: "Thử lại", hint: "Kiểm tra kết nối rồi thử lại." },
  en: { title: "Couldn't load data", retry: "Retry", hint: "Check your connection and try again." },
  zh: { title: "无法加载数据", retry: "重试", hint: "请检查网络连接后重试。" },
});

export const PERMISSION_MATRIX_MESSAGES = defineMessages({
  vi: { permission: "Quyền", yes: "Có", no: "Không" },
  en: { permission: "Permission", yes: "Yes", no: "No" },
  zh: { permission: "权限", yes: "有", no: "无" },
});
