"use client";
import { createDataTableColumnHelper, DataTable } from "@kb/ui";
import { Check, Minus } from "lucide-react";
import { useMemo } from "react";

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
  const columns = useMemo(() => {
    const col = createDataTableColumnHelper<Row>();
    return col.columns([
      col.accessor("label", { header: "Quyền", size: 360, meta: { hideable: false, wrap: true }, enableSorting: false }),
      ...roles.map((r) =>
        col.display({
          id: r.id,
          header: r.label,
          size: 140,
          meta: { align: "center", label: r.label },
          cell: (c) =>
            allowed(c.row.original.id, r.id) ? (
              <Check className="mx-auto h-4 w-4 text-success" aria-label="Có" />
            ) : (
              <Minus className="mx-auto h-4 w-4 text-fg-subtle" aria-label="Không" />
            ),
        }),
      ),
    ]);
  }, [roles, allowed]);
  return <DataTable aria-label={ariaLabel} columns={columns} data={permissions} getRowId={(r) => r.id} pagination={false} />;
}
