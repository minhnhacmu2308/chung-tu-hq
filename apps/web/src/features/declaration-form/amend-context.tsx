"use client";
// Khóa từng ô trong tab Người khai nhập: khai sửa đổi bổ sung (IDA01/EDA01 – quy tắc thuần ở @kb/contracts amendLock),
// hoặc khóa do nơi dùng truyền vào (tờ khai của hồ sơ: ô chưa lưu được). Lý do rỗng → chỉ khóa, không ghi dòng lý do dưới ô.
import { amendLock, type AmendLock } from "@kb/contracts";
import { createContext, useContext, type ReactNode } from "react";
import type { FormValues } from "./form-state";

export type FieldLockLookup = (key: string) => AmendLock | null;
const none: FieldLockLookup = () => null;
const AmendLockContext = createContext<FieldLockLookup>(none);

export function AmendLockProvider({ kind, values, active, override, children }: { kind: "IDA" | "EDA"; values: FormValues; active: boolean; override?: FieldLockLookup | undefined; children: ReactNode }) {
  return <AmendLockContext.Provider value={active ? (key) => amendLock(kind, key, values) : (override ?? none)}>{children}</AmendLockContext.Provider>;
}

export const useAmendLock = () => useContext(AmendLockContext);
