"use client";
// Một khối của bố cục (Vận đơn, Hóa đơn, Đăng ký…): tiêu đề + lưới ô / nhóm ô con / nhóm lặp. Khối Hải quan chưa có dữ liệu → câu "Có sau khi …".
import { Button, Card, CardContent, CardHeader, CardTitle, cn, Grid, toast } from "@kb/ui";
import { DECLARATION_CONDITIONS, itemFields, type ConditionContext, type LayoutBlock } from "@kb/contracts";
import { Copy, Landmark } from "lucide-react";
import { FormField } from "./field";
import { FormFieldGroup } from "./field-group";
import { FormFieldRepeat } from "./field-repeat";
import { isApplicable, type FormValues } from "./form-state";
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
};

export function BlockView({ kind, block, values, onChange, ctx, showInapplicable, showActions = true }: Props) {
  const applicable = isApplicable(block, ctx);
  if (!applicable && !showInapplicable) return null;
  const customs = block.items.flatMap(itemFields).every((f) => f.origin === "CUSTOMS");
  const condition = block.condition ? DECLARATION_CONDITIONS[block.condition].label : undefined;
  return (
    <Card className={cn(!applicable && "opacity-60")}>
      <CardHeader>
        <CardTitle as="h3" className="flex flex-wrap items-center gap-2 text-base">
          {customs && <Landmark aria-hidden="true" className="h-4 w-4 text-info" />}
          {block.title}
        </CardTitle>
        {condition && <p className="text-xs text-fg-subtle">{applicable ? `Có vì: ${condition}` : `Không áp dụng vì: ${condition}`}</p>}
        {onChange && showActions && block.actions?.length ? (
          <div className="flex flex-wrap gap-2 pt-1">
            {block.actions.map((a) => (
              <Button key={a.id} size="sm" variant="secondary" leftIcon={<Copy className="h-4 w-4" />} onClick={() => toast({ tone: "info", title: "Bản mẫu – chưa kết nối", description: a.label })}>
                {a.label}
              </Button>
            ))}
          </div>
        ) : null}
      </CardHeader>
      <CardContent>
        {customs && block.emptyNote && !blockHasData(block, values) ? (
          <p className="rounded-md bg-surface-muted px-3 py-2 text-sm text-fg-muted">{block.emptyNote}</p>
        ) : (
          <Grid cols={{ base: 1, md: 2, xl: 3 }} gap="md">
            {block.items.map((it, i) =>
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
    </Card>
  );
}
