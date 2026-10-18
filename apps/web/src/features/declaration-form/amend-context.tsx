"use client";
// Khai sửa đổi bổ sung (IDA01/EDA01): cho mọi ô trong tab Người khai nhập biết ô nào bị khóa và vì sao (quy tắc thuần ở @kb/contracts amendLock).
import { amendLock, type AmendLock } from "@kb/contracts";
import { createContext, useContext, type ReactNode } from "react";
import type { FormValues } from "./form-state";

type Lookup = (key: string) => AmendLock | null;
const none: Lookup = () => null;
const AmendLockContext = createContext<Lookup>(none);

export function AmendLockProvider({ kind, values, active, children }: { kind: "IDA" | "EDA"; values: FormValues; active: boolean; children: ReactNode }) {
  return <AmendLockContext.Provider value={active ? (key) => amendLock(kind, key, values) : none}>{children}</AmendLockContext.Provider>;
}

export const useAmendLock = () => useContext(AmendLockContext);
