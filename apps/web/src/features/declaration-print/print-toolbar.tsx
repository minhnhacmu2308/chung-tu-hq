"use client";
// Thanh công cụ của bản in tờ khai: nhảy trang (1…N, "Chỉ tiêu khác"), "Chỉ ô cần xử lý (n)" (lần lượt ô lỗi → ô còn thiếu, cuộn tới + mở panel),
// "In / Lưu PDF" (window.print – quy tắc in chỉ giữ trang giấy). Nhiều trang (nhiều dòng hàng) → chọn trang bằng danh sách thả xuống.
import { Button, fill, HelpPopover, Select, ShortcutList, Stack, Switch, useMessages } from "@kb/ui";
import { CircleCheck, Keyboard, ListChecks, Printer } from "lucide-react";
import { useEffect, useState } from "react";
import { formatNumber } from "@/lib/format";
import { pageDomId } from "./print-sheets";
import { PRINT_MESSAGES } from "./print.messages";

/** Quá số trang này → chọn trang bằng danh sách thả xuống thay cho từng nút. */
const MAX_PAGE_BUTTONS = 8;

type Props = {
  pages: number;
  /** id DOM của khối "Chỉ tiêu khác"; null = không có khối. */
  otherFieldsId: string | null;
  attentionCount: number;
  onNextAttention: () => void;
  /** Công tắc "Sửa nhanh tại ô" (chỉ khi có ô sửa được); `locked`: còn ô chưa lưu – lưu / hủy rồi mới tắt được. */
  quickEdit?: { on: boolean; onChange: (on: boolean) => void; locked: boolean };
};

/** Đã tự mở bảng phím tắt sửa nhanh một lần (lần đầu bật công tắc) → không tự mở nữa. */
export const QUICK_SHORTCUTS_SEEN_KEY = "kb-print-quick-shortcuts-seen";

/**
 * Nút "Phím tắt" cạnh công tắc "Sửa nhanh tại ô" (chỉ khi đang bật): hướng dẫn tĩnh nên không đặt khung Alert trên bản in
 * (luật "Thông báo trong trang" – .claude/rules/dung-component-chung.md). `justEnabled`: vừa bật công tắc (không phải tải trang khi đã bật sẵn)
 * → lần đầu tiên tự mở một lần, lúc nút chắc chắn đang trong tầm mắt.
 */
function QuickShortcuts({ justEnabled }: { justEnabled: boolean }) {
  const t = useMessages(PRINT_MESSAGES);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!justEnabled) return;
    try {
      if (window.localStorage.getItem(QUICK_SHORTCUTS_SEEN_KEY)) return;
      window.localStorage.setItem(QUICK_SHORTCUTS_SEEN_KEY, "1");
    } catch {
      return;
    }
    setOpen(true);
  }, [justEnabled]);
  const keys = (k: string) => k.split("+");
  return (
    <HelpPopover label={t.quickShortcuts} title={t.quickShortcutsTitle} icon={<Keyboard aria-hidden="true" className="h-4 w-4" />} open={open} onOpenChange={setOpen} align="end">
      <ShortcutList
        items={[
          { keys: [t.keyType], label: t.scType },
          { keys: keys(t.keyPaste), label: t.scPaste },
          { keys: [t.keyEnter], label: t.scEnter },
          { keys: [t.keyDblClick], label: t.scDblClick },
          { keys: [t.keyF2], label: t.scF2 },
          { keys: [t.keyDelete], label: t.scDelete },
          { keys: [t.keyTab], label: t.scTab },
          { keys: [t.keyEsc], label: t.scEsc },
        ]}
      />
    </HelpPopover>
  );
}

const scrollToId = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

export function PrintToolbar({ pages, otherFieldsId, attentionCount, onNextAttention, quickEdit }: Props) {
  const t = useMessages(PRINT_MESSAGES);
  const [justEnabled, setJustEnabled] = useState(false);
  const list = Array.from({ length: pages }, (_, i) => i + 1);
  return (
    <Stack direction="row" gap="sm" align="center" wrap justify="between" role="toolbar" aria-label={t.toolbarAria}>
      <Stack direction="row" gap="xs" align="center" wrap>
        {pages > MAX_PAGE_BUTTONS ? (
          <Select
            aria-label={t.goToPage}
            className="w-40"
            placeholder={t.goToPagePh}
            value=""
            options={list.map((p) => ({ value: String(p), label: fill(t.pageOf, { p: formatNumber(p), n: formatNumber(pages) }) }))}
            onChange={(e) => e.currentTarget.value && scrollToId(pageDomId(Number(e.currentTarget.value)))}
          />
        ) : (
          list.map((p) => (
            <Button key={p} size="sm" variant="ghost" aria-label={fill(t.pageN, { p })} onClick={() => scrollToId(pageDomId(p))}>
              {p}
            </Button>
          ))
        )}
        {otherFieldsId && (
          <Button size="sm" variant="ghost" onClick={() => scrollToId(otherFieldsId)}>
            {t.otherFields}
          </Button>
        )}
      </Stack>
      <Stack direction="row" gap="xs" align="center" wrap>
        {quickEdit && (
          <Stack direction="row" gap="xs" align="center" className="mr-2">
            <Switch label={t.quickEdit} checked={quickEdit.on} disabled={quickEdit.locked} onCheckedChange={(on) => { setJustEnabled(on); quickEdit.onChange(on); }} />
            {quickEdit.on && <QuickShortcuts justEnabled={justEnabled} />}
          </Stack>
        )}
        <Button
          size="sm"
          variant={attentionCount > 0 ? "primary" : "secondary"}
          leftIcon={attentionCount > 0 ? <ListChecks className="h-4 w-4" /> : <CircleCheck className="h-4 w-4" />}
          disabled={attentionCount === 0}
          onClick={onNextAttention}
        >
          {attentionCount > 0 ? fill(t.attention, { n: formatNumber(attentionCount) }) : t.noAttention}
        </Button>
        <Button size="sm" variant="secondary" leftIcon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>
          {t.print}
        </Button>
      </Stack>
    </Stack>
  );
}
