"use client";
import { createDataTableColumnHelper, DataTable, useMessages } from "@kb/ui";
import { Check, Minus } from "lucide-react";
import { useMemo } from "react";
import { PERMISSION_MATRIX_MESSAGES } from "./common.messages";

type Row = { id: string; label: string };

/**
 * Bảng "vai trò làm được gì": mỗi dòng một quyền, mỗi cột một vai trò, ô có dấu ✓ / –.
 * Dựng trên DataTable (không tự viết bảng HTML) để cùng dáng, cùng hành vi cuộn ngang, cùng a11y với mọi bảng khác.
 */
export function PermissionMatrix({ ariaLabel, permissions, roles, allowed }: {
  ariaLabel: string;
  permissions: readonly Row[];
  roles: readonly Row[];
  allowed: (permissionId: string, roleId: string) => boolean;
}) {
  const t = useMessages(PERMISSION_MATRIX_MESSAGES);
  const columns = useMemo(() => {
    const col = createDataTableColumnHelper<Row>();
    return col.columns([
      col.accessor("label", { header: t.permission, size: 360, meta: { hideable: false, wrap: true }, enableSorting: false }),
      ...roles.map((r) =>
        col.display({
          id: r.id,
          header: r.label,
          size: 140,
          meta: { align: "center", label: r.label },
          cell: (c) =>
            allowed(c.row.original.id, r.id) ? (
              <Check className="mx-auto h-4 w-4 text-success" aria-label={t.yes} />
            ) : (
              <Minus className="mx-auto h-4 w-4 text-fg-subtle" aria-label={t.no} />
            ),
        }),
      ),
    ]);
  }, [roles, allowed, t.permission, t.yes, t.no]);
  return <DataTable aria-label={ariaLabel} columns={columns} data={permissions} getRowId={(r) => r.id} pagination={false} />;
}
