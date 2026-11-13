"use client";
// Tên bộ mã luôn kèm nhãn loại (StatusBadge): bộ nhà cung cấp và bộ khách hàng có thể trùng tên đối tác.
import type { CodeSetKind } from "@kb/contracts";
import { StatusBadge, type Status } from "@kb/ui";

const KIND_STATUS = {
  SHARED: "CODE_SET_SHARED",
  ACCOUNTING: "CODE_SET_ACCOUNTING",
  WAREHOUSE: "CODE_SET_WAREHOUSE",
  CUSTOMS: "CODE_SET_CUSTOMS",
  SUPPLIER: "CODE_SET_SUPPLIER",
  CUSTOMER: "CODE_SET_CUSTOMER",
} as const satisfies Record<CodeSetKind, Status>;

export const codeSetStatus = (kind: CodeSetKind): Status => KIND_STATUS[kind];

export function CodeSetLabel({ name, kind }: { name: string; kind: CodeSetKind }) {
  return (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-2">
      <span className="min-w-0 break-words font-medium text-fg">{name}</span>
      <StatusBadge status={codeSetStatus(kind)} />
    </span>
  );
}
