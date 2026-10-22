"use client";
import { Alert, DateRangePicker, Field, PageHeader, Stack, useMessages, type IsoDateRange } from "@kb/ui";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { AuditTable } from "./audit-table";
import { AUDIT_MESSAGES } from "./audit.messages";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function AuditInner() {
  const t = useMessages(AUDIT_MESSAGES);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  // Khoảng ngày nằm trên URL để F5 / gửi link cho đồng nghiệp vẫn ra đúng kết quả.
  const day = (k: string) => (ISO.test(params.get(k) ?? "") ? params.get(k) : null);
  const range: IsoDateRange = { from: day("from"), to: day("to") };

  const setRange = (r: IsoDateRange) => {
    const next = new URLSearchParams(params);
    for (const k of ["from", "to"] as const) {
      const v = r[k];
      if (v) next.set(k, v);
      else next.delete(k);
    }
    const q = next.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  };

  return (
    <Stack gap="lg">
      <PageHeader
        title={t.title}
        description={t.description}
      />
      <Alert tone="info">{t.filterTip}</Alert>
      <Field label={t.dateRange} className="max-w-md">
        <DateRangePicker value={range} onChange={setRange} />
      </Field>
      <AuditTable from={range.from} to={range.to} onClearRange={() => setRange({ from: null, to: null })} />
    </Stack>
  );
}

export function AuditLogPage() {
  return (
    <Suspense>
      <AuditInner />
    </Suspense>
  );
}
