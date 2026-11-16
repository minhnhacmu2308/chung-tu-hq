"use client";
// Ô tự điền cần người khai kiểm tra lại (itemAutoChecks ở @kb/contracts): ô → mã lý do ổn định; nhóm lặp hiện câu cảnh báo dưới dòng tương ứng.
import { createContext, useContext } from "react";

/** `onConfirm`: có khi người khai xác nhận được giá trị đang có của ô (giữ nguyên mã, lưu như giá trị người khai → hết cảnh báo) – nhóm lặp hiện nút "Xác nhận". */
export type FieldCheck = { key: string; reason: string; onConfirm?: (() => void) | undefined };

const FieldChecksContext = createContext<readonly FieldCheck[]>([]);
export const FieldChecksProvider = FieldChecksContext.Provider;
export const useFieldChecks = (): readonly FieldCheck[] => useContext(FieldChecksContext);
