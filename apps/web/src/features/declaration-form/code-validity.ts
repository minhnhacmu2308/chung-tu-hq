"use client";
// Ô mã có danh mục báo lên nơi chứa (panel sửa ô) khi giá trị đang nhập không có trong danh mục – nơi chứa chặn lưu.
// Không có nơi nhận (form khác) → ô mã chỉ tự báo đỏ.
import { createContext, useContext } from "react";

/** `report(fieldKey, invalid)`: ô mã gọi khi trạng thái hợp lệ đổi và khi gỡ (invalid = false). */
export const CodeValidityContext = createContext<((fieldKey: string, invalid: boolean) => void) | null>(null);

export const useCodeValidityReport = () => useContext(CodeValidityContext);
