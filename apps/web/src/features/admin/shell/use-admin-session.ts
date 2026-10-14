"use client";
import { staffCan, type AdminPermission } from "@kb/contracts";
import { useQuery } from "@tanstack/react-query";
import { adminKeys, getAdminSession } from "@/api/admin";

/**
 * Quản trị viên đang đăng nhập + hàm kiểm tra quyền. Thao tác không được làm thì ẨN hẳn (đừng hiện rồi báo lỗi);
 * backend vẫn chặn lại lần nữa – đây chỉ là lớp giao diện.
 */
export function useAdminSession() {
  const query = useQuery({ queryKey: adminKeys.session, queryFn: getAdminSession });
  const staff = query.data?.staff;
  return { staff, isLoading: query.isLoading, isSignedOut: query.isSuccess && !staff, can: (permission: AdminPermission) => !!staff && staffCan(staff.role, permission) };
}
