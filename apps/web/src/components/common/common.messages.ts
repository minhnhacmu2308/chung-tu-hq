import { defineMessages } from "@kb/ui";

export const DOCUMENT_PREVIEW_MESSAGES = defineMessages({
  vi: {
    originalLabel: "Chứng từ gốc: {kind} – {file}",
    missingTitle: "File gốc không còn trong kho lưu trữ",
    missingDesc: "{file} – kết quả đọc vẫn dùng được. Cần xem lại chứng từ thì upload lại file ở bước Upload chứng từ.",
    errorTitle: "Không mở được file gốc",
    retry: "Thử lại",
    emptyPage: "Trang này không có trường cần đọc.",
    renderingFile: "Đang mở file gốc…",
    openNewTab: "Mở ở tab mới",
  },
  en: {
    originalLabel: "Original document: {kind} – {file}",
    missingTitle: "The original file is no longer in storage",
    missingDesc: "{file} – the extracted data is still usable. To review the document, upload the file again in the Upload documents step.",
    errorTitle: "Couldn't open the original file",
    retry: "Retry",
    emptyPage: "This page has no fields to read.",
    renderingFile: "Opening the original file…",
    openNewTab: "Open in new tab",
  },
  zh: {
    originalLabel: "原始单证：{kind} – {file}",
    missingTitle: "原始文件已不在存储中",
    missingDesc: "{file} – 读取结果仍可使用。如需查看单证，请在“上传单证”步骤重新上传文件。",
    errorTitle: "无法打开原始文件",
    retry: "重试",
    emptyPage: "此页没有需要读取的字段。",
    renderingFile: "正在打开原始文件…",
    openNewTab: "在新标签页打开",
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
