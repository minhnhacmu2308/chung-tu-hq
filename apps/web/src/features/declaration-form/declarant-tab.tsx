"use client";
// Tab 1 – Người khai nhập: mục lục nhóm (đếm đã nhập / tổng, ô bắt buộc còn thiếu), công tắc hiện ô không áp dụng, các khối của nhóm đang chọn.
import { Badge, Button, cn, Grid, Select, Stack, Switch } from "@kb/ui";
import type { DeclarationLayout } from "@kb/contracts";
import { BlockView } from "./block-view";
import { conditionContext, itemProgress, sectionProgress, type FormValues } from "./form-state";
import { ItemsSection } from "./items";
import { ITEMS_SECTION } from "./view-state";

type Props = {
  layout: DeclarationLayout;
  values: FormValues;
  items: FormValues[];
  section: string;
  onSection: (id: string) => void;
  onChange: (key: string, value: string) => void;
  onItemChange: (index: number, key: string, value: string) => void;
  showInapplicable: boolean;
  onShowInapplicable: (v: boolean) => void;
};

export function DeclarantTab({ layout, values, items, section, onSection, onChange, onItemChange, showInapplicable, onShowInapplicable }: Props) {
  const kind = layout.kind;
  const ctx = conditionContext(kind, values);
  const itemsMissing = items.reduce((n, it) => n + itemProgress(kind, layout, it).missing, 0);
  const nav = [
    ...layout.declarant.map((s, i) => ({ id: s.id, title: `${i + 1}. ${s.title}`, p: sectionProgress(kind, s, values) })),
    { id: ITEMS_SECTION, title: `${layout.declarant.length + 1}. Danh sách hàng`, p: { filled: items.length, total: items.length, missingRequired: itemsMissing } },
  ];
  const current = layout.declarant.find((s) => s.id === section);
  return (
    <Stack gap="md">
      <Switch label="Hiện cả chỉ tiêu không áp dụng" description="Ô theo tình huống không áp dụng cho tờ khai này (ví dụ thời hạn tái xuất khi không phải tạm nhập) hiện mờ kèm lý do – để đối chiếu đủ ô." checked={showInapplicable} onCheckedChange={onShowInapplicable} />
      <Grid cols={{ base: 1, lg: 4 }} gap="lg">
        <nav aria-label="Nhóm chỉ tiêu" className="min-w-0">
          <div className="cq-lg:hidden">
            <Select aria-label="Chọn nhóm chỉ tiêu" value={section} onChange={(e) => onSection(e.currentTarget.value)} options={nav.map((n) => ({ value: n.id, label: `${n.title} (${n.p.filled}/${n.p.total})` }))} />
          </div>
          <ul className="hidden flex-col gap-1 cq-lg:flex">
            {nav.map((n) => (
              <li key={n.id}>
                <Button variant={n.id === section ? "secondary" : "ghost"} fullWidth className="h-auto justify-between py-2 text-left" aria-current={n.id === section ? "true" : undefined} onClick={() => onSection(n.id)}>
                  <span className="min-w-0 flex-1 truncate">{n.title}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    {n.p.missingRequired > 0 && <Badge tone="warning" size="sm">thiếu {n.p.missingRequired}</Badge>}
                    <span className="text-xs tabular-nums text-fg-subtle">{n.id === ITEMS_SECTION ? `${n.p.total} dòng` : `${n.p.filled}/${n.p.total}`}</span>
                  </span>
                </Button>
              </li>
            ))}
          </ul>
        </nav>
        <div className={cn("flex min-w-0 flex-col gap-3 cq-lg:col-span-3")}>
          <h2 className="text-base font-semibold text-fg">{nav.find((n) => n.id === section)?.title}</h2>
          {section === ITEMS_SECTION ? (
            <ItemsSection layout={layout} items={items} onItemChange={onItemChange} showInapplicable={showInapplicable} />
          ) : (
            current && (
              <Stack gap="md">
                {current.blocks.map((b) => (
                  <BlockView key={b.id} kind={kind} block={b} values={values} onChange={onChange} ctx={ctx} showInapplicable={showInapplicable} />
                ))}
              </Stack>
            )
          )}
        </div>
      </Grid>
    </Stack>
  );
}
