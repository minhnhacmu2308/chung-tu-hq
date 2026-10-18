"use client";
// Tab 1 – Người khai nhập: mục lục nhóm (đếm đã nhập / tổng, ô bắt buộc còn thiếu), công tắc hiện ô không áp dụng, các khối của nhóm đang chọn.
// Tờ khai đã đăng ký: phần người khai chỉ đọc; đã khai (chưa thông quan) mở sửa qua khai sửa đổi bổ sung.
import { Alert, Badge, Button, cn, Grid, Select, Stack, Switch, toast } from "@kb/ui";
import { FileCheck2, Pencil, Send, Undo2 } from "lucide-react";
import type { DeclarationLayout } from "@kb/contracts";
import { AmendLockProvider } from "./amend-context";
import { BlockView } from "./block-view";
import { conditionContext, itemProgress, sectionProgress, type FormValues } from "./form-state";
import { ItemsSection } from "./items";
import type { Stage } from "./fixtures";
import { TransportOperationsBar } from "./transport-operations-bar";
import { ITEMS_SECTION, navSections } from "./view-state";

type Props = {
  layout: DeclarationLayout;
  stage: Stage;
  values: FormValues;
  items: FormValues[];
  section: string;
  onSection: (id: string) => void;
  /** Không truyền → phần người khai chỉ đọc. */
  onChange?: ((key: string, value: string) => void) | undefined;
  onItemChange?: ((index: number, key: string, value: string) => void) | undefined;
  amending: boolean;
  onAmend: (on: boolean) => void;
  /** Số ô đã sửa so với tờ khai đã đăng ký (khi khai sửa đổi). */
  changed: number;
  showInapplicable: boolean;
  onShowInapplicable: (v: boolean) => void;
};

type NoticeProps = { kind: "IDA" | "EDA"; stage: Stage; amending: boolean; onAmend: (on: boolean) => void; changed: number };

/** Sửa trong thông quan (tờ khai đã phân luồng, chưa thông quan): IDD → IDA01 → IDE (xuất: EDD → EDA01 → EDE). */
function StageNotice({ kind, stage, amending, onAmend, changed }: NoticeProps) {
  const [recall, code, register] = kind === "IDA" ? ["IDD", "IDA01", "IDE"] : ["EDD", "EDA01", "EDE"];
  const notConnected = (what: string) => () => toast({ tone: "info", title: "Bản mẫu – chưa kết nối", description: what });
  if (stage === "thong-quan") {
    return (
      <Alert tone="info" title="Tờ khai đã thông quan – thông tin người khai chỉ đọc">
        Sửa sau thông quan dùng “Khai sửa đổi bổ sung sau thông quan (AMA)” ở tab Theo dõi & nghiệp vụ.
      </Alert>
    );
  }
  if (stage !== "da-khai") return null;
  if (!amending) {
    return (
      <Alert tone="info" title="Tờ khai đã đăng ký – thông tin người khai chỉ đọc">
        <p>Cần sửa trước khi thông quan: gọi tờ khai về sửa ({recall}) rồi khai sửa đổi bổ sung ({code}).</p>
        <div className="flex flex-wrap gap-2 pt-2">
          <Button size="sm" variant="secondary" leftIcon={<Pencil className="h-4 w-4" />} onClick={() => onAmend(true)}>Khai sửa đổi bổ sung ({code})</Button>
        </div>
      </Alert>
    );
  }
  return (
    <Alert tone="warning" title={`Khai sửa đổi bổ sung trong thông quan (${code}) – ${changed ? `đã sửa ${changed} ô` : "chưa sửa ô nào"}`}>
      <p>Quy trình: gọi tờ khai về sửa ({recall}) → khai tạm sửa đổi ({code}) → khai chính thức sửa đổi ({register}).</p>
      <p>Ô có biểu tượng khóa không được sửa (mục 3 Phụ lục II TT39) hoặc Hệ thống không hỗ trợ sửa – khi đó ghi nội dung đúng vào ô Ký hiệu và số hiệu.</p>
      <p>Tờ khai đã phân luồng nên khai bổ sung lúc này bị xử lý theo quy định (Điều 20 TT38, sửa đổi TT121/2025).</p>
      <div className="flex flex-wrap gap-2 pt-2">
        <Button size="sm" leftIcon={<Send className="h-4 w-4" />} disabled={!changed} onClick={notConnected(`Khai tạm sửa đổi (${code})`)}>Khai tạm sửa đổi ({code})</Button>
        <Button size="sm" variant="secondary" leftIcon={<FileCheck2 className="h-4 w-4" />} disabled={!changed} onClick={notConnected(`Khai chính thức sửa đổi (${register})`)}>Khai chính thức ({register})</Button>
        <Button size="sm" variant="ghost" leftIcon={<Undo2 className="h-4 w-4" />} onClick={() => onAmend(false)}>Hủy sửa đổi</Button>
      </div>
    </Alert>
  );
}

export function DeclarantTab({ layout, stage, values, items, section, onSection, onChange, onItemChange, amending, onAmend, changed, showInapplicable, onShowInapplicable }: Props) {
  const kind = layout.kind;
  const ctx = conditionContext(kind, values);
  const itemsMissing = items.reduce((n, it) => n + itemProgress(kind, layout, it).missing, 0);
  const nav = navSections(layout).map((n) => {
    const s = layout.declarant.find((x) => x.id === n.id);
    return { ...n, p: s ? sectionProgress(kind, s, values) : { filled: items.length, total: items.length, missingRequired: itemsMissing } };
  });
  const current = layout.declarant.find((s) => s.id === section);
  return (
    <Stack gap="md">
      <StageNotice kind={kind} stage={stage} amending={amending} onAmend={onAmend} changed={changed} />
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
                  <span className="min-w-0 flex-1 whitespace-normal break-words">{n.title}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    {n.p.missingRequired > 0 && <Badge tone="warning" size="sm">thiếu {n.p.missingRequired}</Badge>}
                    <span className="text-xs tabular-nums text-fg-subtle">{n.id === ITEMS_SECTION ? `${n.p.total} dòng` : `${n.p.filled}/${n.p.total}`}</span>
                  </span>
                </Button>
              </li>
            ))}
          </ul>
        </nav>
        <AmendLockProvider kind={kind} values={values} active={stage === "da-khai" && amending}>
          <div className={cn("flex min-w-0 flex-col gap-3 cq-lg:col-span-3")}>
            <h2 className="text-base font-semibold text-fg">{nav.find((n) => n.id === section)?.title}</h2>
            {section === ITEMS_SECTION ? (
              <ItemsSection layout={layout} items={items} onItemChange={onItemChange} showInapplicable={showInapplicable} />
            ) : (
              current && (
                <Stack gap="md">
                  {current.id === "van-chuyen" && <TransportOperationsBar kind={kind} header={values} stage={stage} amending={amending} showInapplicable={showInapplicable} />}
                  {current.blocks.map((b) => (
                    <BlockView key={b.id} kind={kind} block={b} values={values} onChange={onChange} ctx={ctx} showInapplicable={showInapplicable} showActions={stage === "nhap"} />
                  ))}
                </Stack>
              )
            )}
          </div>
        </AmendLockProvider>
      </Grid>
    </Stack>
  );
}
