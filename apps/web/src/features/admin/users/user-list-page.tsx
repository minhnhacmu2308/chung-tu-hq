"use client";
import type { AdminUser } from "@kb/contracts";
import { Alert, PageHeader, SegmentedControl, Stack } from "@kb/ui";
import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo } from "react";
import { adminKeys, listAdminUsers } from "@/api/admin";
import { LoadError } from "@/components/common/load-error";
import { UserTable } from "./user-table";

const VIEWS = ["all", "pending", "unverified", "disabled"] as const;
type View = (typeof VIEWS)[number];

const MATCH: Record<View, (u: AdminUser) => boolean> = {
  all: () => true,
  pending: (u) => u.status === "PENDING_JOIN",
  unverified: (u) => !u.emailVerified,
  disabled: (u) => u.status === "DISABLED",
};
const LABEL: Record<View, string> = { all: "Tất cả", pending: "Chờ duyệt tham gia", unverified: "Chưa xác thực email", disabled: "Đã khóa" };

function ListInner() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const raw = params.get("view");
  const view: View = VIEWS.includes(raw as View) ? (raw as View) : "all";
  const users = useQuery({ queryKey: adminKeys.users(), queryFn: () => listAdminUsers() });
  const rows = useMemo(() => (users.data ?? []).filter(MATCH[view]), [users.data, view]);

  return (
    <Stack gap="lg">
      <PageHeader
        title="Người dùng"
        description="Mọi tài khoản trên hệ thống, xuyên các doanh nghiệp. Bấm một dòng để xem phiên đăng nhập và thao tác hỗ trợ."
      />
      {users.isError && <LoadError onRetry={() => void users.refetch()} title="Không tải được danh sách người dùng" />}
      <Stack gap="md">
        <SegmentedControl<View>
          label="Nhóm tài khoản"
          hideLabel
          className="justify-start"
          value={view}
          onChange={(v) => router.replace(v === "all" ? pathname : `${pathname}?view=${v}`, { scroll: false })}
          options={VIEWS.map((v) => ({ value: v, label: users.data ? `${LABEL[v]} (${users.data.filter(MATCH[v]).length})` : LABEL[v] }))}
        />
        {view === "pending" && (
          <Alert tone="info">
            Những người đã đăng ký theo MST của một doanh nghiệp đã có trên hệ thống và đang chờ chủ doanh nghiệp duyệt. Đội vận hành không duyệt thay.
          </Alert>
        )}
        <UserTable
          users={rows}
          loading={users.isLoading}
          showJoinRequested={view === "pending"}
          emptyTitle={view === "all" ? "Chưa có người dùng" : `Không có tài khoản nào ở nhóm “${LABEL[view]}”`}
        />
      </Stack>
    </Stack>
  );
}

export function UserListPage() {
  return (
    <Suspense>
      <ListInner />
    </Suspense>
  );
}
