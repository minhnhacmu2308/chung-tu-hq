"use client";
import { PageHeader, Stack, Tabs, TabsContent, TabsList, TabsTrigger, useMessages } from "@kb/ui";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { CertificatesTab } from "./certificates-tab";
import { DeclarationTab } from "./declaration-tab";
import { IntegrationsTab } from "./integrations-tab";
import { MembersTab } from "./members-tab";
import { OrgTab } from "./org-tab";
import { PlanTab } from "./plan-tab";
import { PreferencesTab } from "./preferences-tab";
import { SETTINGS_PAGE_MESSAGES } from "./settings-page.messages";

type TabId = "org" | "plan" | "members" | "integrations" | "certificates" | "declaration" | "preferences";
const TABS: { id: TabId; render: () => ReactNode }[] = [
  { id: "org", render: () => <OrgTab /> },
  { id: "plan", render: () => <PlanTab /> },
  { id: "members", render: () => <MembersTab /> },
  { id: "integrations", render: () => <IntegrationsTab /> },
  { id: "certificates", render: () => <CertificatesTab /> },
  { id: "declaration", render: () => <DeclarationTab /> },
  { id: "preferences", render: () => <PreferencesTab /> },
];

function SettingsInner() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const m = useMessages(SETTINGS_PAGE_MESSAGES);
  const tab = TABS.some((t) => t.id === params.get("tab")) ? params.get("tab")! : "org";

  return (
    <Stack gap="lg">
      <PageHeader title={m.title} description={m.description} />
      <Tabs value={tab} onValueChange={(t) => router.replace(`${pathname}?tab=${t}`, { scroll: false })}>
        <TabsList aria-label={m.tabsLabel}>
          {TABS.map((t) => (
            <TabsTrigger key={t.id} value={t.id}>{m[t.id]}</TabsTrigger>
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
