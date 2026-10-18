"use client";
// Tab 2 – Hải quan trả về: chỉ đọc; khối chưa có dữ liệu hiện "Có sau khi …"; trị giá/thuế từng dòng hàng theo Hải quan tính.
import { Alert, Card, CardContent, CardHeader, CardTitle, Stack } from "@kb/ui";
import type { DeclarationLayout } from "@kb/contracts";
import { BlockView } from "./block-view";
import { conditionContext, type FormValues } from "./form-state";
import { blockHasData } from "./view-state";

export function CustomsTab({ layout, values, items }: { layout: DeclarationLayout; values: FormValues; items: FormValues[] }) {
  const kind = layout.kind;
  const ctx = conditionContext(kind, values);
  const itemHasData = items.some((it) => layout.item.customs.some((b) => blockHasData(b, it)));
  return (
    <Stack gap="lg">
      <Alert tone="info" title="Người khai không nhập các thông tin này">
        Hệ thống VNACCS cấp và tính sau từng nghiệp vụ (khai tạm, khai chính thức, thông quan). Số thuế ở đây là số chính thức, thay cho số ứng dụng ước tính.
      </Alert>
      {layout.customs.map((s) => (
        <div key={s.id}>
          <h2 className="mb-2 text-sm font-semibold text-fg">
            {s.title}
          </h2>
          <Stack gap="md">
            {s.blocks.map((b) => (
              <BlockView key={b.id} kind={kind} block={b} values={values} ctx={ctx} showInapplicable={false} />
            ))}
          </Stack>
        </div>
      ))}
      <div>
        <h2 className="mb-2 text-sm font-semibold text-fg">
          Từng dòng hàng
        </h2>
        {!itemHasData ? (
          <p className="rounded-md bg-surface-muted px-3 py-2 text-sm text-fg-muted">{layout.item.customs[0]?.emptyNote ?? "Có sau khi khai tạm."}</p>
        ) : (
          <Stack gap="md">
            {items.map((it, i) => (
              <Card key={i}>
                <CardHeader>
                  <CardTitle as="h3" className="text-base">
                    Dòng {i + 1}
                    {it["HAG_CMD"] ? ` · HS ${it["HAG_CMD"]}` : ""}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Stack gap="md">
                    {layout.item.customs.map((b) => (
                      <BlockView key={b.id} kind={kind} block={b} values={it} ctx={conditionContext(kind, it)} showInapplicable={false} />
                    ))}
                  </Stack>
                </CardContent>
              </Card>
            ))}
          </Stack>
        )}
      </div>
    </Stack>
  );
}
