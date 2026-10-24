// Nhãn vị trí lỗi Hải quan (dòng hàng / mã lỗi) – dùng bởi customs-errors.ts.
import { defineMessages } from "@kb/ui";

export const CUSTOMS_ERROR_MESSAGES = defineMessages({
  vi: { lineField: "Dòng hàng {line} · {field}", line: "Dòng hàng {line}", code: "Mã lỗi {code}" },
  en: { lineField: "Line {line} · {field}", line: "Line {line}", code: "Error code {code}" },
  zh: { lineField: "第 {line} 行 · {field}", line: "第 {line} 行", code: "错误代码 {code}" },
});
