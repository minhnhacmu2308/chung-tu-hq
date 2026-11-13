"use client";
// Danh mục hàng hóa dùng chung (ADR 0015, spec §6): 4 tab chọn bằng ?tab= – Mặt hàng · Bộ mã · Chờ duyệt (kèm số mục PENDING) · Nhập dữ liệu.
import { Badge, PageHeader, Stack, Tabs, TabsContent, TabsList, TabsTrigger, useMessages } from "@kb/ui";
import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { catalogKeys, listMatchQueue } from "@/api/catalog";
import { CATALOG_MESSAGES } from "./catalog.messages";
import { CodeSetsTab } from "./code-sets-tab";
import { ImportTab } from "./import-tab";
import { ItemsTab } from "./items-tab";
import { QueueTab } from "./queue-tab";

type TabId = "items" | "code-sets" | "queue" | "import";
type Messages = (typeof CATALOG_MESSAGES)["vi"];
const TABS: { id: TabId; label: keyof Messages; render: () => ReactNode }[] = [
  { id: "items", label: "tabItems", render: () => <ItemsTab /> },
  { id: "code-sets", label: "tabCodeSets", render: () => <CodeSetsTab /> },
  { id: "queue", label: "tabQueue", render: () => <QueueTab /> },
  { id: "import", label: "tabImport", render: () => <ImportTab /> },
];
/** Chỉ cần tổng số mục PENDING cho nhãn tab. */
const COUNT_QUERY = { pageSize: 1 } as const;

/** Số mục chờ duyệt cạnh nhãn tab – component riêng để số đến muộn không làm cả trang (bảng của tab đang mở) dựng lại. */
function PendingCount() {
  const pending = useQuery({ queryKey: catalogKeys.queue(COUNT_QUERY), queryFn: () => listMatchQueue(COUNT_QUERY) }).data?.total ?? 0;
  return pending > 0 ? <Badge tone="warning" size="sm">{pending}</Badge> : null;
}

function CatalogInner() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const t = useMessages(CATALOG_MESSAGES);
  const tab = TABS.find((x) => x.id === params.get("tab"))?.id ?? "items";

  return (
    <Stack gap="lg">
      <PageHeader title={t.title} description={t.description} />
      <Tabs value={tab} onValueChange={(v) => router.replace(`${pathname}?tab=${v}`, { scroll: false })}>
        <TabsList aria-label={t.tabsLabel}>
          {TABS.map((x) => (
            <TabsTrigger key={x.id} value={x.id}>
              {t[x.label]}
              {x.id === "queue" && <PendingCount />}
            </TabsTrigger>
          ))}
        </TabsList>
        {TABS.map((x) => (
          <TabsContent key={x.id} value={x.id} className="pt-4">
            {x.render()}
          </TabsContent>
        ))}
      </Tabs>
    </Stack>
  );
}

export function CatalogPage() {
  return (
    <Suspense>
      <CatalogInner />
    </Suspense>
  );
}
