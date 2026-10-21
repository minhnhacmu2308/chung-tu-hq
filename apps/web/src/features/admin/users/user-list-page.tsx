"use client";
import type { AdminUser } from "@kb/contracts";
import { Alert, fill, PageHeader, SegmentedControl, Stack, useMessages } from "@kb/ui";
import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo } from "react";
import { adminKeys, listAdminUsers } from "@/api/admin";
import { LoadError } from "@/components/common/load-error";
import { UserTable } from "./user-table";
import { USER_LIST_MESSAGES } from "./users.messages";

const VIEWS = ["all", "pending", "unverified", "disabled"] as const;
type View = (typeof VIEWS)[number];

const MATCH: Record<View, (u: AdminUser) => boolean> = {
  all: () => true,
  pending: (u) => u.status === "PENDING_JOIN",
  unverified: (u) => !u.emailVerified,
  disabled: (u) => u.status === "DISABLED",
};
const LABEL_KEY = { all: "viewAll", pending: "viewPending", unverified: "viewUnverified", disabled: "viewDisabled" } as const satisfies Record<View, string>;

function ListInner() {
  const t = useMessages(USER_LIST_MESSAGES);
  const LABEL: Record<View, string> = { all: t[LABEL_KEY.all], pending: t[LABEL_KEY.pending], unverified: t[LABEL_KEY.unverified], disabled: t[LABEL_KEY.disabled] };
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
        title={t.title}
        description={t.description}
      />
      {users.isError && <LoadError onRetry={() => void users.refetch()} title={t.loadError} />}
      <Stack gap="md">
        <SegmentedControl<View>
          label={t.viewGroup}
          hideLabel
          className="justify-start"
          value={view}
          onChange={(v) => router.replace(v === "all" ? pathname : `${pathname}?view=${v}`, { scroll: false })}
          options={VIEWS.map((v) => ({ value: v, label: users.data ? `${LABEL[v]} (${users.data.filter(MATCH[v]).length})` : LABEL[v] }))}
        />
        {view === "pending" && (
          <Alert tone="info">
            {t.pendingInfo}
          </Alert>
        )}
        <UserTable
          users={rows}
          loading={users.isLoading}
          showJoinRequested={view === "pending"}
          emptyTitle={view === "all" ? t.emptyAll : fill(t.emptyView, { view: LABEL[view] })}
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
