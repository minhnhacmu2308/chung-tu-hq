import { defineMessages } from "@kb/ui";

export const DOCUMENT_PREVIEW_MESSAGES = defineMessages({
  vi: {
    originalLabel: "Chứng từ gốc: {kind} – {file}", loading: "Đang tải file gốc…", error: "Không mở được file gốc", errorHint: "Thử lại sau hoặc mở ở tab mới.",
    unsupported: "Không xem trước được loại file này", unsupportedHint: "Mở ở tab mới để xem.", openNewTab: "Mở tab mới",
  },
  en: {
    originalLabel: "Original document: {kind} – {file}", loading: "Loading original file…", error: "Couldn't open the original file", errorHint: "Try again later or open it in a new tab.",
    unsupported: "This file type can't be previewed", unsupportedHint: "Open it in a new tab to view.", openNewTab: "Open in new tab",
  },
  zh: {
    originalLabel: "原始单证：{kind} – {file}", loading: "正在加载原始文件…", error: "无法打开原始文件", errorHint: "请稍后重试或在新标签页中打开。",
    unsupported: "无法预览此文件类型", unsupportedHint: "请在新标签页中打开查看。", openNewTab: "在新标签页打开",
  },
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
