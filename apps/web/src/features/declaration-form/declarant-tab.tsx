"use client";
// Tab 1 – Người khai nhập: mục lục nhóm (đếm đã nhập / tổng, ô bắt buộc còn thiếu) dính khi cuộn, các khối của nhóm đang chọn,
// nút "Đến ô còn thiếu", "Hiển thị" (chế độ ô / nhãn bên trái / mật độ), "Nhóm trước / Nhóm tiếp" ở cuối nhóm.
// Tờ khai đã đăng ký: phần người khai chỉ đọc; đã khai (chưa thông quan) mở sửa qua khai sửa đổi bổ sung.
import { Alert, Badge, Button, cn, Grid, Select, Stack, toast } from "@kb/ui";
import { ArrowLeft, ArrowRight, ChevronDown, ChevronUp, CircleAlert, FileCheck2, Pencil, Send, Undo2 } from "lucide-react";
import type { DeclarationLayout } from "@kb/contracts";
import { useRef, useState, type ReactNode } from "react";
import { AmendLockProvider, type FieldLockLookup } from "./amend-context";
import { BlockView } from "./block-view";
import { neighborSections } from "./compact-rules";
import { conditionContext, itemProgress, sectionProgress, type FormValues } from "./form-state";
import { ItemsSection } from "./items";
import type { Stage } from "./fixtures";
import { TransportOperationsBar } from "./transport-operations-bar";
import { ViewOptions } from "./view-options";
import { useViewPrefs } from "./view-prefs";
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
  /** Thao tác ở đầu panel chi tiết dòng hàng (sửa số liệu chứng từ ở OCR, chọn mã HS…). */
  itemActions?: ((index: number) => ReactNode) | undefined;
  amending: boolean;
  onAmend: (on: boolean) => void;
  /** Số ô đã sửa so với tờ khai đã đăng ký (khi khai sửa đổi). */
  changed: number;
  /** Khóa từng ô do nơi dùng quyết định (tờ khai của hồ sơ: ô chưa lưu được). */
  lockOf?: FieldLockLookup | undefined;
  /** Thao tác bản mẫu chưa kết nối (chia tách vận đơn, khai định danh, chép số cont) – tắt khi chạy trên hồ sơ thật. */
  prototypeActions?: boolean;
  /** Đếm / báo ô bắt buộc còn thiếu – tắt khi phần mềm tự điền ô lúc truyền (tờ khai của hồ sơ). */
  showMissing?: boolean;
};

type NoticeProps = { kind: "IDA" | "EDA"; stage: Stage; amending: boolean; onAmend: (on: boolean) => void; changed: number };

/** Thông báo giai đoạn gọn (phương án A): tiêu đề + nút thao tác; giải thích dài mở bằng "Chi tiết". */
function StageNotice({ kind, stage, amending, onAmend, changed }: NoticeProps) {
  const [details, setDetails] = useState(false);
  const [recall, code, register] = kind === "IDA" ? ["IDD", "IDA01", "IDE"] : ["EDD", "EDA01", "EDE"];
  const notConnected = (what: string) => () => toast({ tone: "info", title: "Bản mẫu – chưa kết nối", description: what });
  if (stage === "nhap") return null;
  const more = (
    <Button size="sm" variant="ghost" aria-expanded={details} rightIcon={details ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />} onClick={() => setDetails((d) => !d)}>
      {details ? "Ẩn chi tiết" : "Chi tiết"}
    </Button>
  );
  const row = (buttons: ReactNode) => <div className="flex flex-wrap items-center gap-2 pt-1">{buttons}{more}</div>;
  if (stage === "thong-quan") {
    return (
      <Alert tone="info" title="Tờ khai đã thông quan – thông tin người khai chỉ đọc">
        {details && <p>Sửa sau thông quan dùng “Khai sửa đổi bổ sung sau thông quan (AMA)” ở tab Theo dõi & nghiệp vụ.</p>}
        {row(null)}
      </Alert>
    );
  }
  if (!amending) {
    return (
      <Alert tone="info" title="Tờ khai đã đăng ký – thông tin người khai chỉ đọc">
        {details && <p>Cần sửa trước khi thông quan: gọi tờ khai về sửa ({recall}) rồi khai sửa đổi bổ sung ({code}).</p>}
        {row(<Button size="sm" variant="secondary" leftIcon={<Pencil className="h-4 w-4" />} onClick={() => onAmend(true)}>Khai sửa đổi bổ sung ({code})</Button>)}
      </Alert>
    );
  }
  return (
    <Alert tone="warning" title={`Khai sửa đổi bổ sung trong thông quan (${code}) – ${changed ? `đã sửa ${changed} ô` : "chưa sửa ô nào"}`}>
      {details && (
        <>
          <p>Quy trình: gọi tờ khai về sửa ({recall}) → khai tạm sửa đổi ({code}) → khai chính thức sửa đổi ({register}).</p>
          <p>Ô có biểu tượng khóa không được sửa (mục 3 Phụ lục II TT39) hoặc Hệ thống không hỗ trợ sửa – khi đó ghi nội dung đúng vào ô Ký hiệu và số hiệu.</p>
          <p>Tờ khai đã phân luồng nên khai bổ sung lúc này bị xử lý theo quy định (Điều 20 TT38, sửa đổi TT121/2025).</p>
        </>
      )}
      {row(
        <>
          <Button size="sm" leftIcon={<Send className="h-4 w-4" />} disabled={!changed} onClick={notConnected(`Khai tạm sửa đổi (${code})`)}>Khai tạm sửa đổi ({code})</Button>
          <Button size="sm" variant="secondary" leftIcon={<FileCheck2 className="h-4 w-4" />} disabled={!changed} onClick={notConnected(`Khai chính thức sửa đổi (${register})`)}>Khai chính thức ({register})</Button>
          <Button size="sm" variant="ghost" leftIcon={<Undo2 className="h-4 w-4" />} onClick={() => onAmend(false)}>Hủy sửa đổi</Button>
        </>,
      )}
    </Alert>
  );
}

/** Cuộn tới ô còn thiếu đầu tiên trong nhóm đang xem và đặt con trỏ vào ô đó. */
function goToMissing() {
  const el = document.querySelector<HTMLElement>("main [data-missing]");
  if (!el) return;
  const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ block: "center", behavior: smooth ? "smooth" : "auto" });
  el.querySelector<HTMLElement>("input, textarea, select")?.focus({ preventScroll: true });
}

export function DeclarantTab({ layout, stage, values, items, section, onSection, onChange, onItemChange, itemActions, amending, onAmend, changed, lockOf, prototypeActions = true, showMissing = true }: Props) {
  const { mode } = useViewPrefs();
  const showInapplicable = mode === "tat-ca";
  const headingRef = useRef<HTMLHeadingElement>(null);
  const kind = layout.kind;
  const ctx = conditionContext(kind, values);
  const itemsMissing = items.reduce((n, it) => n + itemProgress(kind, layout, it).missing, 0);
  const nav = navSections(layout).map((n) => {
    const s = layout.declarant.find((x) => x.id === n.id);
    const p = s ? sectionProgress(kind, s, values) : { filled: items.length, total: items.length, missingRequired: itemsMissing };
    return { ...n, p: showMissing ? p : { ...p, missingRequired: 0 } };
  });
  const current = layout.declarant.find((s) => s.id === section);
  const here = nav.find((n) => n.id === section);
  const { prev, next } = neighborSections(nav, section);
  const missingHere = section !== ITEMS_SECTION && onChange ? here?.p.missingRequired ?? 0 : 0;
  const go = (id: string) => {
    onSection(id);
    requestAnimationFrame(() => headingRef.current?.scrollIntoView({ block: "start" }));
  };
  const missingButton = missingHere > 0 && (
    <Button size="sm" variant="secondary" leftIcon={<CircleAlert className="h-4 w-4" />} onClick={goToMissing}>
      Đến ô còn thiếu ({missingHere})
    </Button>
  );
  return (
    <Stack gap="md">
      <StageNotice kind={kind} stage={stage} amending={amending} onAmend={onAmend} changed={changed} />
      <Grid cols={{ base: 1, lg: 4 }} gap="lg">
        {/* Mục lục dính khi cuộn (G): mobile là thanh chọn nhóm sát mép trên, màn rộng là danh sách bên trái. */}
        <nav aria-label="Nhóm chỉ tiêu" className="sticky top-shell-flush z-10 min-w-0 self-start bg-bg py-2 cq-lg:top-shell cq-lg:py-0">
          <div className="flex items-center gap-2 cq-lg:hidden">
            <Select className="min-w-0 flex-1" aria-label="Chọn nhóm chỉ tiêu" value={section} onChange={(e) => go(e.currentTarget.value)} options={nav.map((n) => ({ value: n.id, label: `${n.title} (${n.p.filled}/${n.p.total}${n.p.missingRequired ? ` · thiếu ${n.p.missingRequired}` : ""})` }))} />
          </div>
          <ul className="hidden flex-col gap-1 cq-lg:flex">
            {nav.map((n) => (
              <li key={n.id}>
                <Button variant={n.id === section ? "secondary" : "ghost"} fullWidth className="h-auto justify-between py-2 text-left" aria-current={n.id === section ? "true" : undefined} onClick={() => go(n.id)}>
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
        <AmendLockProvider kind={kind} values={values} active={stage === "da-khai" && amending} override={lockOf}>
          {/* @container: lưới ô trong khối đo theo bề rộng cột form (không tính cột mục lục) – 4 cột chỉ khi mỗi ô đủ rộng cho nhãn một dòng. */}
          <div className={cn("@container flex min-w-0 flex-col gap-3 cq-lg:col-span-3")}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 ref={headingRef} className="scroll-mt-20 text-base font-semibold text-fg">{here?.title}</h2>
              <div className="flex flex-wrap items-center gap-2">
                {missingButton}
                <ViewOptions />
              </div>
            </div>
            {section === ITEMS_SECTION ? (
              <ItemsSection layout={layout} items={items} onItemChange={onItemChange} actions={itemActions} showInapplicable={showInapplicable} />
            ) : (
              current && (
                <Stack gap="md">
                  {prototypeActions && current.id === "van-chuyen" && <TransportOperationsBar kind={kind} header={values} stage={stage} amending={amending} showInapplicable={showInapplicable} />}
                  {current.blocks.map((b) => (
                    <BlockView key={`${b.id}-${mode}`} kind={kind} block={b} values={values} onChange={onChange} ctx={ctx} showInapplicable={showInapplicable} showActions={prototypeActions && stage === "nhap"} compactable />
                  ))}
                </Stack>
              )
            )}
            {/* Nhóm trước / Nhóm tiếp (G): khỏi cuộn ngược lên mục lục. */}
            <div className="flex flex-wrap justify-between gap-2 border-t border-border pt-3">
              {prev ? <Button variant="ghost" leftIcon={<ArrowLeft className="h-4 w-4" />} onClick={() => go(prev.id)}>{prev.title}</Button> : <span />}
              {next && <Button variant="secondary" rightIcon={<ArrowRight className="h-4 w-4" />} onClick={() => go(next.id)}>{next.title}</Button>}
            </div>
          </div>
        </AmendLockProvider>
      </Grid>
    </Stack>
  );
}
