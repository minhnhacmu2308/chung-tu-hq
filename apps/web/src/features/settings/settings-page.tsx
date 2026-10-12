"use client";
import { PageHeader, Stack, Tabs, TabsContent, TabsList, TabsTrigger } from "@kb/ui";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { CertificatesTab } from "./certificates-tab";
import { IntegrationsTab } from "./integrations-tab";
import { MembersTab } from "./members-tab";
import { OrgTab } from "./org-tab";
import { PlanTab } from "./plan-tab";
import { PreferencesTab } from "./preferences-tab";

const TABS: { id: string; label: string; render: () => ReactNode }[] = [
  { id: "org", label: "Doanh nghiệp", render: () => <OrgTab /> },
  { id: "plan", label: "Gói dịch vụ & sử dụng", render: () => <PlanTab /> },
  { id: "members", label: "Thành viên & vai trò", render: () => <MembersTab /> },
  { id: "integrations", label: "Kết nối hệ thống", render: () => <IntegrationsTab /> },
  { id: "certificates", label: "Chứng thư số", render: () => <CertificatesTab /> },
  { id: "preferences", label: "Ngưỡng & giao diện", render: () => <PreferencesTab /> },
];

function SettingsInner() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab = TABS.some((t) => t.id === params.get("tab")) ? params.get("tab")! : "org";

  return (
    <Stack gap="lg">
      <PageHeader title="Tài khoản & tích hợp" description="Thông tin doanh nghiệp, gói dịch vụ, thành viên, kết nối hệ thống bên ngoài và chứng thư số." />
      <Tabs value={tab} onValueChange={(t) => router.replace(`${pathname}?tab=${t}`, { scroll: false })}>
        <TabsList aria-label="Mục thiết lập">
          {TABS.map((t) => (
            <TabsTrigger key={t.id} value={t.id}>{t.label}</TabsTrigger>
          ))}
        </TabsList>
        {TABS.map((t) => (
          <TabsContent key={t.id} value={t.id} className="pt-4">
            {t.render()}
          </TabsContent>
        ))}
      </Tabs>
    </Stack>
  );
}

export function SettingsPage() {
  return (
    <Suspense>
      <SettingsInner />
    </Suspense>
  );
}
