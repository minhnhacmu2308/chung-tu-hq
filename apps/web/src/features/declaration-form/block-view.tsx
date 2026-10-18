"use client";
// Một khối của bố cục (Vận đơn, Hóa đơn, Đăng ký…): tiêu đề + lưới ô / nhóm ô con / nhóm lặp. Khối Hải quan chưa có dữ liệu → câu "Có sau khi …".
// Gọn diện tích: lưới tới 4 cột (D; 2 cột khi nhãn bên trái – F), lọc “Ô cần nhập” và khối trống ít dùng đóng sẵn (E).
import { Button, Card, CardContent, CardHeader, CardTitle, cn, Grid, toast } from "@kb/ui";
import { DECLARATION_CONDITIONS, itemFields, type ConditionContext, type LayoutBlock } from "@kb/contracts";
import { ChevronDown, ChevronUp, Copy, Landmark } from "lucide-react";
import { useId, useState } from "react";
import { blockCollapsedByDefault, itemVisible } from "./compact-rules";
import { FormField } from "./field";
import { FormFieldGroup } from "./field-group";
import { FormFieldRepeat } from "./field-repeat";
import { isApplicable, type FormValues } from "./form-state";
import { useViewPrefs } from "./view-prefs";
import { blockHasData } from "./view-state";

type Props = {
  kind: "IDA" | "EDA";
  block: LayoutBlock;
  values: FormValues;
  /** Không truyền → khối chỉ đọc (Hải quan trả về, hoặc phần người khai của tờ khai đã đăng ký). */
  onChange?: ((key: string, value: string) => void) | undefined;
  ctx: ConditionContext;
  showInapplicable: boolean;
  /** Thao tác của khối (chép số container…) – ẩn khi khai sửa đổi (ảnh EDA01 không có). */
  showActions?: boolean;
  /** Áp chế độ hiển thị “Ô cần nhập” và đóng sẵn khối trống (phần người khai của tờ khai, dòng hàng). */
  compactable?: boolean;
};

export function BlockView({ kind, block, values, onChange, ctx, showInapplicable, showActions = true, compactable = false }: Props) {
  const { mode, labelsLeft } = useViewPrefs();
  const [open, setOpen] = useState(() => !(compactable && blockCollapsedByDefault(kind, block, values, ctx)));
  const bodyId = useId();
  const applicable = isApplicable(block, ctx);
  if (!applicable && !showInapplicable) return null;
  const customs = block.items.flatMap(itemFields).every((f) => f.origin === "CUSTOMS");
  const items = compactable ? block.items.filter((it) => itemVisible(mode, kind, it, values, ctx, block.condition)) : block.items;
  if (compactable && items.length === 0) return null;
  const condition = block.condition ? DECLARATION_CONDITIONS[block.condition].label : undefined;
  const empty = !customs && !blockHasData(block, values);
  // Lưới đo theo cột form (@container ở DeclarantTab): 4 cột từ 56rem (ô ≥ ~200px, nhãn một dòng), 3 cột từ 42rem.
  const toggle = compactable && empty && (
    <Button size="sm" variant="ghost" aria-expanded={open} aria-controls={bodyId} rightIcon={open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />} onClick={() => setOpen((o) => !o)}>
      {open ? "Thu gọn" : onChange ? "Mở để nhập" : "Mở"}
    </Button>
  );
  return (
    <Card className={cn(!applicable && "opacity-60")}>
      <CardHeader className={cn(!open && "pb-5")}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle as="h3" className="flex flex-wrap items-center gap-2 text-base">
            {customs && <Landmark aria-hidden="true" className="h-4 w-4 text-info" />}
            {block.title}
            {compactable && empty && !open && <span className="text-xs font-normal text-fg-subtle">chưa có dữ liệu</span>}
          </CardTitle>
          {toggle}
        </div>
        {open && condition && <p className="text-xs text-fg-subtle">{applicable ? `Có vì: ${condition}` : `Không áp dụng vì: ${condition}`}</p>}
        {open && onChange && showActions && block.actions?.length ? (
          <div className="flex flex-wrap gap-2 pt-1">
            {block.actions.map((a) => (
              <Button key={a.id} size="sm" variant="secondary" leftIcon={<Copy className="h-4 w-4" />} onClick={() => toast({ tone: "info", title: "Bản mẫu – chưa kết nối", description: a.label })}>
                {a.label}
              </Button>
            ))}
          </div>
        ) : null}
      </CardHeader>
      {open && (
        <CardContent id={bodyId}>
          {customs && block.emptyNote && !blockHasData(block, values) ? (
            <p className="rounded-md bg-surface-muted px-3 py-2 text-sm text-fg-muted">{block.emptyNote}</p>
          ) : (
            <Grid cols={labelsLeft ? { base: 1, lg: 2 } : { base: 1, sm: 2, md: 3, xl: 4 }} gap="md">
              {items.map((it, i) =>
                it.kind === "field" ? (
                  <FormField key={it.key} kind={kind} field={it} values={values} onChange={onChange} ctx={ctx} showInapplicable={showInapplicable} parentCondition={block.condition} />
                ) : it.kind === "group" ? (
                  <FormFieldGroup key={`g${i}`} kind={kind} group={it} values={values} onChange={onChange} ctx={ctx} showInapplicable={showInapplicable} parentCondition={block.condition} />
                ) : (
                  <FormFieldRepeat key={`r${i}`} kind={kind} repeat={it} values={values} onChange={onChange} ctx={ctx} showInapplicable={showInapplicable} parentCondition={block.condition} />
                ),
              )}
            </Grid>
          )}
        </CardContent>
      )}
    </Card>
  );
}
