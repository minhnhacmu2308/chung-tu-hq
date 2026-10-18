"use client";
// Bản mẫu tờ khai đầy đủ chỉ tiêu (docs/superpowers/specs/2026-10-17-to-khai-day-du-ban-mau-design.md): 3 tab theo luồng làm việc,
// dữ liệu giả theo ảnh mẫu, sửa chỉ trên màn hình (không lưu).
import { Badge, PageHeader, SegmentedControl, Stack, Tabs, TabsContent, TabsList, TabsTrigger } from "@kb/ui";
import { layoutFor } from "@kb/contracts";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { CustomsTab } from "./customs-tab";
import { DeclarantTab } from "./declarant-tab";
import { displayValue } from "./display";
import { fixtureFor, valuesAt, type Stage } from "./fixtures";
import type { FormValues } from "./form-state";
import { OperationsTab } from "./operations-tab";
import { changedCount, declarantEditable, summaryAt } from "./stage-rules";
import { parseView, toQuery, type Tab, type ViewState } from "./view-state";

const STAGE_OPTIONS = [
  { value: "nhap", label: "Nháp" },
  { value: "da-khai", label: "Đã khai" },
  { value: "thong-quan", label: "Đã thông quan" },
] as const;

/** Giá trị đang sửa trên màn hình, khởi tạo lại khi đổi loại tờ khai hoặc giai đoạn. */
function PrototypeBody({ view, go }: { view: ViewState; go: (patch: Partial<ViewState>) => void }) {
  const layout = layoutFor(view.kind);
  const fixture = fixtureFor(view.kind);
  const initial = useMemo(() => valuesAt(fixture, view.stage), [fixture, view.stage]);
  const [values, setValues] = useState<FormValues>(initial.header);
  const [items, setItems] = useState<FormValues[]>(initial.items);
  const [showInapplicable, setShowInapplicable] = useState(false);
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
  const missing = <span className="text-fg-subtle">Chưa có</span>;
  return (
    <Stack gap="lg">
      <dl className="flex flex-wrap gap-x-6 gap-y-2 rounded-md border border-border bg-surface px-4 py-3">
        {summaryAt(layout, view.stage).map((f) => (
          <div key={f.key} className="flex min-w-0 flex-col">
            <dt className="text-xs text-fg-muted">{f.label}</dt>
            <dd className="text-sm font-medium text-fg">{displayValue(f, values[f.key] ?? "") || missing}</dd>
          </div>
        ))}
      </dl>
      <Tabs value={view.tab} onValueChange={(t) => go({ tab: t as Tab })}>
        <TabsList aria-label="Phần của tờ khai">
          <TabsTrigger value="khai">Người khai nhập</TabsTrigger>
          <TabsTrigger value="hai-quan">
            Hải quan trả về {view.stage === "nhap" && <Badge tone="neutral" size="sm">chưa có</Badge>}
          </TabsTrigger>
          <TabsTrigger value="nghiep-vu">Theo dõi & nghiệp vụ</TabsTrigger>
        </TabsList>
        <TabsContent value="khai" className="pt-4">
          <DeclarantTab
            layout={layout} stage={view.stage} values={values} items={items} section={view.section} onSection={(id) => go({ section: id })}
            onChange={editable ? (k, v) => setValues((s) => ({ ...s, [k]: v })) : undefined}
            onItemChange={editable ? (i, k, v) => setItems((s) => s.map((it, j) => (j === i ? { ...it, [k]: v } : it))) : undefined}
            amending={amending} onAmend={amend} changed={amending ? changedCount(initial, { header: values, items }) : 0}
            showInapplicable={showInapplicable} onShowInapplicable={setShowInapplicable}
          />
        </TabsContent>
        <TabsContent value="hai-quan" className="pt-4">
          <CustomsTab layout={layout} values={values} items={items} />
        </TabsContent>
        <TabsContent value="nghiep-vu" className="pt-4">
          <OperationsTab kind={view.kind} fixture={fixture} stage={view.stage} values={values} />
        </TabsContent>
      </Tabs>
    </Stack>
  );
}

export function DeclarationFormPrototype() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const view = parseView(params);
  const go = (patch: Partial<ViewState>) => {
    const next = { ...view, ...patch };
    // Đổi loại tờ khai → về nhóm đầu (id nhóm khác nhau giữa IDA/EDA được parseView kiểm lại).
    router.replace(`${pathname}?${toQuery(next)}`, { scroll: false });
  };
  const fixture = fixtureFor(view.kind);
  return (
    <Stack gap="lg">
      <PageHeader
        title={`Bản mẫu tờ khai ${view.kind === "IDA" ? "nhập khẩu (IDA)" : "xuất khẩu (EDA)"}`}
        description={`Đủ chỉ tiêu theo Phụ lục II (TT39/2018, sửa đổi TT121/2025) – dữ liệu mẫu ${fixture.code}, sửa chỉ trên màn hình, không lưu.`}
      />
      <div className="flex flex-col gap-3 cq-md:flex-row cq-md:flex-wrap cq-md:items-end">
        <SegmentedControl label="Loại tờ khai" value={view.kind} onChange={(k) => go({ kind: k })} options={[{ value: "IDA", label: "Nhập khẩu" }, { value: "EDA", label: "Xuất khẩu" }]} />
        <SegmentedControl label="Giai đoạn" value={view.stage} onChange={(s: Stage) => go({ stage: s })} options={STAGE_OPTIONS} />
      </div>
      <PrototypeBody key={`${view.kind}-${view.stage}`} view={view} go={go} />
    </Stack>
  );
}
