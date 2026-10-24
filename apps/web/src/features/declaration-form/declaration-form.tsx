"use client";
// Bản mẫu tờ khai đầy đủ chỉ tiêu (docs/superpowers/specs/2026-10-17-to-khai-day-du-ban-mau-design.md): 3 tab theo luồng làm việc,
// dữ liệu giả theo ảnh mẫu, sửa chỉ trên màn hình (không lưu). Đầu trang gọn (phương án A): Loại / Giai đoạn cạnh tiêu đề, mô tả trong nút ⓘ,
// thanh tóm tắt một dòng.
import { Badge, Button, fill, PageHeader, Popover, PopoverContent, PopoverTrigger, SegmentedControl, Stack, Tabs, TabsContent, TabsList, TabsTrigger, useMessages } from "@kb/ui";
import { Info } from "lucide-react";
import { layoutFor } from "@kb/contracts";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { CustomsTab } from "./customs-tab";
import { DeclarantTab } from "./declarant-tab";
import { displayValue } from "./display";
import { fixtureFor, valuesAt, type Stage } from "./fixtures";
import { FORM_MESSAGES } from "./form.messages";
import type { FormValues } from "./form-state";
import { OperationsTab } from "./operations-tab";
import { changedCount, declarantEditable, summaryAt } from "./stage-rules";
import { ViewPrefsProvider } from "./view-prefs";
import { parseView, toQuery, type Tab, type ViewState } from "./view-state";


/** Giá trị đang sửa trên màn hình, khởi tạo lại khi đổi loại tờ khai hoặc giai đoạn. */
function PrototypeBody({ view, go }: { view: ViewState; go: (patch: Partial<ViewState>) => void }) {
  const t = useMessages(FORM_MESSAGES);
  const layout = layoutFor(view.kind);
  const fixture = fixtureFor(view.kind);
  const initial = useMemo(() => valuesAt(fixture, view.stage), [fixture, view.stage]);
  const [values, setValues] = useState<FormValues>(initial.header);
  const [items, setItems] = useState<FormValues[]>(initial.items);
  // Khai sửa đổi bổ sung (chỉ giai đoạn đã khai): mở khóa phần người khai; hủy → trả lại giá trị đã đăng ký.
  const [amending, setAmending] = useState(false);
  const editable = declarantEditable(view.stage, amending);
  const amend = (on: boolean) => {
    if (!on) {
      setValues(initial.header);
      setItems(initial.items);
    }
    setAmending(on);
  };
  const missing = <span className="text-fg-subtle">{t.notYet}</span>;
  return (
    <Stack gap="md">
      <dl className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm">
        {summaryAt(layout, view.stage).map((f) => (
          <div key={f.key} className="flex min-w-0 gap-1.5">
            <dt className="text-fg-muted">{f.label}:</dt>
            <dd className="font-medium text-fg">{displayValue(f, values[f.key] ?? "") || missing}</dd>
          </div>
        ))}
      </dl>
      <Tabs value={view.tab} onValueChange={(t) => go({ tab: t as Tab })}>
        <TabsList aria-label={t.partsAria}>
          <TabsTrigger value="khai">{t.tabDeclarant}</TabsTrigger>
          <TabsTrigger value="hai-quan">
            {t.tabCustoms} {view.stage === "nhap" && <Badge tone="neutral" size="sm">{t.notYetBadge}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="nghiep-vu">{t.tabOps}</TabsTrigger>
        </TabsList>
        <TabsContent value="khai" className="pt-3">
          <DeclarantTab
            layout={layout} stage={view.stage} values={values} items={items} section={view.section} onSection={(id) => go({ section: id })}
            onChange={editable ? (k, v) => setValues((s) => ({ ...s, [k]: v })) : undefined}
            onItemChange={editable ? (i, k, v) => setItems((s) => s.map((it, j) => (j === i ? { ...it, [k]: v } : it))) : undefined}
            amending={amending} onAmend={amend} changed={amending ? changedCount(initial, { header: values, items }) : 0}
          />
        </TabsContent>
        <TabsContent value="hai-quan" className="pt-3">
          <CustomsTab layout={layout} values={values} items={items} />
        </TabsContent>
        <TabsContent value="nghiep-vu" className="pt-3">
          <OperationsTab kind={view.kind} fixture={fixture} stage={view.stage} values={values} />
        </TabsContent>
      </Tabs>
    </Stack>
  );
}

export function DeclarationFormPrototype() {
  const t = useMessages(FORM_MESSAGES);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const stageOptions = [
    { value: "nhap", label: t.stageDraft },
    { value: "da-khai", label: t.stageDeclared },
    { value: "thong-quan", label: t.stageCleared },
  ] as const;
  const view = parseView(params);
  const go = (patch: Partial<ViewState>) => {
    const next = { ...view, ...patch };
    // Đổi loại tờ khai → về nhóm đầu (id nhóm khác nhau giữa IDA/EDA được parseView kiểm lại).
    router.replace(`${pathname}?${toQuery(next)}`, { scroll: false });
  };
  const fixture = fixtureFor(view.kind);
  return (
    <ViewPrefsProvider>
      <Stack gap="md">
        <PageHeader
          title={
            <span className="inline-flex items-center gap-1">
              {view.kind === "IDA" ? t.protoTitleImport : t.protoTitleExport}
              <Popover>
                <PopoverTrigger asChild>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-fg-muted" aria-label={t.aboutAria}>
                    <Info className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="max-w-sm text-sm" showClose>
                  {fill(t.aboutBody, { code: fixture.code })}
                </PopoverContent>
              </Popover>
            </span>
          }
          actions={
            <>
              <SegmentedControl label={t.kindLabel} value={view.kind} onChange={(k) => go({ kind: k })} options={[{ value: "IDA", label: t.kindImport }, { value: "EDA", label: t.kindExport }]} />
              <SegmentedControl label={t.stageLabel} value={view.stage} onChange={(s: Stage) => go({ stage: s })} options={stageOptions} />
            </>
          }
        />
        <PrototypeBody key={`${view.kind}-${view.stage}`} view={view} go={go} />
      </Stack>
    </ViewPrefsProvider>
  );
}
