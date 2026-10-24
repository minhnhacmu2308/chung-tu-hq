// Không import runtime từ @kb/ui: file này cũng chạy ở route server.
import type { UiLocale } from "@kb/ui";

/** Tiêu đề cột + tên sheet mặc định của file Excel bảng đọc chứng từ. */
export const DOCUMENT_SHEETS_XLSX_MESSAGES: Record<UiLocale, { stt: string; label: string; value: string; fallbackSheet: string }> = {
  vi: { stt: "STT", label: "TÊN TRƯỜNG", value: "TRỊ GIÁ", fallbackSheet: "Chứng từ" },
  en: { stt: "NO.", label: "FIELD NAME", value: "VALUE", fallbackSheet: "Document" },
  zh: { stt: "序号", label: "字段名称", value: "值", fallbackSheet: "单证" },
};
