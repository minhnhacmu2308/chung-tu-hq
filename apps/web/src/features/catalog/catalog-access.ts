// Quyền danh mục trên giao diện (spec danh mục §7) – chỉ để ẩn nút cho đỡ rối; backend kiểm lại thật (catalog/permissions.ts).
// VIEWER xem/xuất · DECLARANT đề xuất mã, tạo mặt hàng (vào hàng chờ) · APPROVER + sửa thông tin chung · người phụ trách bộ mã (≠ VIEWER)
// sửa/duyệt mã trong bộ mình, quy đổi · ADMIN/OWNER tất cả (gộp, ngưng dùng).
import type { CodeSet, Role } from "@kb/contracts";
import { useQuery } from "@tanstack/react-query";
import { getSession, sessionKeys } from "@/api/session";

export type CatalogAccess = {
  /** Đã biết vai trò (phiên đã tải) – chưa biết thì ẩn mọi nút ghi. */
  ready: boolean;
  isAdmin: boolean;
  /** Đề xuất mã / thêm mặt hàng (mọi vai trò trừ VIEWER). */
  canContribute: boolean;
  /** Sửa thông tin chung mặt hàng: APPROVER, ADMIN, OWNER. */
  canEditItem: boolean;
  /** Sửa/duyệt/chuyển/ngưng mã trong bộ: Quản trị/Chủ, hoặc người phụ trách bộ (≠ VIEWER). */
  managesSet: (codeSetId: string) => boolean;
  /** Quy đổi đơn vị: người sửa thông tin chung, hoặc người phụ trách bất kỳ bộ mã nào. */
  canEditConversions: boolean;
};

export function catalogAccess(role: Role | null, userId: string | null, sets: readonly Pick<CodeSet, "id" | "ownerIds">[]): CatalogAccess {
  const isAdmin = role === "ADMIN" || role === "OWNER";
  const canContribute = role !== null && role !== "VIEWER";
  const canEditItem = isAdmin || role === "APPROVER";
  const owns = (id: string) => !!userId && !!sets.find((s) => s.id === id)?.ownerIds.includes(userId);
  const managesSet = (id: string) => isAdmin || (canContribute && owns(id));
  return { ready: role !== null, isAdmin, canContribute, canEditItem, managesSet, canEditConversions: canEditItem || (canContribute && sets.some((s) => owns(s.id))) };
}

export function useCatalogAccess(sets: readonly Pick<CodeSet, "id" | "ownerIds">[]): CatalogAccess {
  const session = useQuery({ queryKey: sessionKeys.me, queryFn: getSession });
  const user = session.data?.user;
  return catalogAccess(user?.role ?? null, user?.id ?? null, sets);
}
