"use client";
// Một khối của bố cục (Vận đơn, Hóa đơn, Đăng ký…): tiêu đề + lưới ô / nhóm ô con / nhóm lặp. Khối Hải quan chưa có dữ liệu → câu "Có sau khi …".
// Dùng ở bản khai bổ sung AMA (bước 7) và panel nghiệp vụ vận đơn của bản in. Lưới tới 4 cột theo bề rộng vùng nội dung.
import { Card, CardContent, CardHeader, CardTitle, fill, Grid, useMessages } from "@kb/ui";
import { DECLARATION_CONDITIONS, itemFields, type ConditionContext, type LayoutBlock } from "@kb/contracts";
import { Landmark } from "lucide-react";
import { FormField } from "./field";
import { FormFieldGroup } from "./field-group";
import { FormFieldRepeat } from "./field-repeat";
import { FORM_MESSAGES } from "./form.messages";
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
};

export function BlockView({ kind, block, values, onChange, ctx, showInapplicable }: Props) {
  const t = useMessages(FORM_MESSAGES);
  const applicable = isApplicable(block, ctx);
  if (!applicable && !showInapplicable) return null;
  const customs = block.items.flatMap(itemFields).every((f) => f.origin === "CUSTOMS");
  const condition = block.condition ? DECLARATION_CONDITIONS[block.condition].label : undefined;
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h3" className="flex flex-wrap items-center gap-2 text-base">
          {customs && <Landmark aria-hidden="true" className="h-4 w-4 text-info" />}
          {block.title}
        </CardTitle>
        {condition && <p className="text-xs text-fg-subtle">{fill(applicable ? t.presentBecause : t.notApplicableBecause, { c: condition })}</p>}
      </CardHeader>
      <CardContent>
        {customs && block.emptyNote && !blockHasData(block, values) ? (
          <p className="rounded-md bg-surface-muted px-3 py-2 text-sm text-fg-muted">{block.emptyNote}</p>
        ) : (
          <Grid cols={{ base: 1, sm: 2, md: 3, xl: 4 }} gap="md">
            {block.items.map((it, i) =>
              it.kind === "field" ? (
                <FormField key={it.key} kind={kind} field={it} values={values} onChange={onChange} ctx={ctx} showInapplicable={showInapplicable} parentCondition={block.condition} dimmed={!applicable} />
              ) : it.kind === "group" ? (
                <FormFieldGroup key={`g${i}`} kind={kind} group={it} values={values} onChange={onChange} ctx={ctx} showInapplicable={showInapplicable} parentCondition={block.condition} dimmed={!applicable} />
              ) : (
                <FormFieldRepeat key={`r${i}`} kind={kind} repeat={it} values={values} onChange={onChange} ctx={ctx} showInapplicable={showInapplicable} parentCondition={block.condition} dimmed={!applicable} />
              ),
            )}
          </Grid>
        )}
      </CardContent>
    </Card>
  );
}
