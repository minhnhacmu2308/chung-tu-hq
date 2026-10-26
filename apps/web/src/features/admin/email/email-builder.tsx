"use client";
// Trình soạn email kéo thả: thêm khối (tiêu đề, đoạn văn, nút, ảnh, đường kẻ, khoảng trống), kéo ⋮⋮ để đổi thứ tự, bấm khối để sửa,
// chèn biến cá nhân hóa; bên phải xem trước đúng HTML sẽ gửi (máy tính / điện thoại). Dùng chung cho mẫu, soạn gửi và chữ ký.
import { EMAIL_BLOCK_TYPES, newEmailBlock, renderEmail, type EmailBlock, type EmailBlockType, type EmailVariable } from "@kb/contracts";
import {
  Button, cn, Field, fill, Grid, HtmlPreview, IconTile, Input, Select, SegmentedControl, SortableList, Stack, Textarea, useMessages,
} from "@kb/ui";
import { Copy, Heading, ImageIcon, Minus, MousePointerClick, MoveVertical, Sparkles, Trash2, Type, type LucideIcon } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { EMAIL_BUILDER_MESSAGES } from "./email.messages";

export type EmailDraft = { subject: string; preheader: string; blocks: EmailBlock[] };

const ICON: Record<EmailBlockType, LucideIcon> = { heading: Heading, text: Type, button: MousePointerClick, image: ImageIcon, divider: Minus, spacer: MoveVertical };
const VARS: { key: EmailVariable; label: "varName" | "varEmail" | "varOrg" }[] = [
  { key: "name", label: "varName" },
  { key: "email", label: "varEmail" },
  { key: "orgName", label: "varOrg" },
];
export const newBlockId = () => `blk_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
/** Bản sao khối với id mới (nhân bản khối, nhân bản mẫu). */
export const cloneBlocks = (blocks: readonly EmailBlock[]): EmailBlock[] => blocks.map((b) => ({ ...b, id: newBlockId() }));

type T = Record<keyof (typeof EMAIL_BUILDER_MESSAGES)["vi"], string>;

/** Một dòng tóm tắt khối trong danh sách. */
function summary(b: EmailBlock, t: T): string {
  switch (b.type) {
    case "heading": case "text": return b.text.split("\n")[0] || t.untitled;
    case "button": return b.label ? `${b.label} → ${b.url}` : t.untitled;
    case "image": return b.alt || b.url;
    case "divider": return "———";
    case "spacer": return t[b.size === "sm" ? "small" : b.size === "lg" ? "large" : "medium"];
  }
}

function AlignControl({ value, onChange, t }: { value: "left" | "center" | "right"; onChange: (v: "left" | "center" | "right") => void; t: T }) {
  return <SegmentedControl label={t.align} value={value} onChange={onChange} options={[{ value: "left", label: t.left }, { value: "center", label: t.center }, { value: "right", label: t.right }]} />;
}

function VarChips({ onInsert, t }: { onInsert: (v: string) => void; t: T }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t.variables}>
      <span className="text-xs text-fg-muted">{t.variables}:</span>
      {VARS.map((v) => (
        <Button key={v.key} type="button" size="sm" variant="ghost" className="h-7 px-2 font-mono text-xs" title={t[v.label]} onClick={() => onInsert(`{{${v.key}}}`)}>
          {`{{${v.key}}}`}
        </Button>
      ))}
    </div>
  );
}

/** Ô sửa của một khối – theo loại khối. */
function BlockEditor({ b, onChange, t }: { b: EmailBlock; onChange: (b: EmailBlock) => void; t: T }) {
  switch (b.type) {
    case "heading":
      return (
        <Stack gap="sm">
          <Field label={t.content}>
            <Input value={b.text} onChange={(e) => onChange({ ...b, text: e.target.value })} autoFocus />
          </Field>
          <VarChips t={t} onInsert={(v) => onChange({ ...b, text: b.text + v })} />
          <div className="flex flex-wrap gap-4">
            <SegmentedControl label={t.level} value={String(b.level) as "1" | "2"} onChange={(v) => onChange({ ...b, level: v === "1" ? 1 : 2 })} options={[{ value: "1", label: t.levelBig }, { value: "2", label: t.levelSmall }]} />
            <AlignControl t={t} value={b.align} onChange={(align) => onChange({ ...b, align })} />
          </div>
        </Stack>
      );
    case "text":
      return (
        <Stack gap="sm">
          <Field label={t.content} hint={t.textHint}>
            <Textarea value={b.text} onChange={(e) => onChange({ ...b, text: e.target.value })} rows={5} autoFocus />
          </Field>
          <VarChips t={t} onInsert={(v) => onChange({ ...b, text: b.text + v })} />
          <AlignControl t={t} value={b.align} onChange={(align) => onChange({ ...b, align })} />
        </Stack>
      );
    case "button":
      return (
        <Stack gap="sm">
          <Grid cols={{ base: 1, sm: 2 }}>
            <Field label={t.label}>
              <Input value={b.label} onChange={(e) => onChange({ ...b, label: e.target.value })} autoFocus />
            </Field>
            <Field label={t.url}>
              <Input value={b.url} onChange={(e) => onChange({ ...b, url: e.target.value })} inputMode="url" />
            </Field>
          </Grid>
          <div className="flex flex-wrap gap-4">
            <SegmentedControl label={t.style} value={b.tone} onChange={(tone) => onChange({ ...b, tone })} options={[{ value: "primary", label: t.primary }, { value: "neutral", label: t.neutral }]} />
            <AlignControl t={t} value={b.align} onChange={(align) => onChange({ ...b, align })} />
          </div>
        </Stack>
      );
    case "image":
      return (
        <Stack gap="sm">
          <Field label={t.imageUrl}>
            <Input value={b.url} onChange={(e) => onChange({ ...b, url: e.target.value })} inputMode="url" autoFocus />
          </Field>
          <Grid cols={{ base: 1, sm: 2 }}>
            <Field label={t.alt}>
              <Input value={b.alt} onChange={(e) => onChange({ ...b, alt: e.target.value })} />
            </Field>
            <Field label={t.width}>
              <Input type="number" min={40} max={600} value={b.width} onChange={(e) => onChange({ ...b, width: Math.max(40, Math.min(600, Number(e.target.value) || 40)) })} />
            </Field>
          </Grid>
          <AlignControl t={t} value={b.align} onChange={(align) => onChange({ ...b, align })} />
        </Stack>
      );
    case "spacer":
      return (
        <SegmentedControl label={t.size} value={b.size} onChange={(size) => onChange({ ...b, size })} options={[{ value: "sm", label: t.small }, { value: "md", label: t.medium }, { value: "lg", label: t.large }]} />
      );
    case "divider":
      return null;
  }
}

export function EmailBuilder({
  value,
  onChange,
  mode = "email",
  signature,
  onAskAi,
  aside,
}: {
  value: EmailDraft;
  onChange: (next: EmailDraft) => void;
  /** "signature": không có tiêu đề / dòng xem trước, xem trước chỉ chữ ký. */
  mode?: "email" | "signature";
  /** Chữ ký gắn cuối khi xem trước. */
  signature?: readonly EmailBlock[];
  /** Hiện nút "Nhờ AI soạn". */
  onAskAi?: () => void;
  /** Thêm vào cột trái dưới các khối (vd chọn người nhận). */
  aside?: ReactNode;
}) {
  const t = useMessages(EMAIL_BUILDER_MESSAGES);
  const [openId, setOpenId] = useState<string | null>(null);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const setBlocks = (blocks: EmailBlock[]) => onChange({ ...value, blocks });
  const add = (type: EmailBlockType) => {
    const b = newEmailBlock(type, newBlockId());
    // Thêm ngay sau khối đang mở (nếu có), không thì cuối danh sách.
    const at = openId ? value.blocks.findIndex((x) => x.id === openId) + 1 : value.blocks.length;
    setBlocks([...value.blocks.slice(0, at), b, ...value.blocks.slice(at)]);
    setOpenId(type === "divider" ? null : b.id);
  };
  const preview = useMemo(
    () =>
      renderEmail(
        { subject: value.subject || t.untitled, preheader: value.preheader, blocks: value.blocks },
        { vars: { name: t.sampleName, email: "an.nguyen@example.com", orgName: t.sampleOrg }, ...(signature ? { signature } : {}) },
      ).html,
    [value, signature, mode, t],
  );

  return (
    <Grid cols={{ base: 1, xl: 2 }} gap="lg">
      <Stack gap="md" className="min-w-0">
        {mode === "email" && (
          <>
            <Field label={t.subject} required>
              <Input value={value.subject} onChange={(e) => onChange({ ...value, subject: e.target.value })} maxLength={200} />
            </Field>
            <Field label={t.preheader} hint={t.preheaderHint}>
              <Input value={value.preheader} onChange={(e) => onChange({ ...value, preheader: e.target.value })} maxLength={200} />
            </Field>
          </>
        )}
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-fg">{t.addBlock}</p>
          <div className="flex flex-wrap gap-2">
            {EMAIL_BLOCK_TYPES.map((type) => {
              const Icon = ICON[type];
              return (
                <Button key={type} type="button" size="sm" variant="secondary" leftIcon={<Icon className="h-4 w-4" />} onClick={() => add(type)}>
                  {t[type]}
                </Button>
              );
            })}
            {onAskAi && (
              <Button type="button" size="sm" leftIcon={<Sparkles className="h-4 w-4" />} onClick={onAskAi}>
                {t.askAi}
              </Button>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-medium text-fg">{t.blocks}</p>
            <p className="text-xs text-fg-muted">{t.blocksHint}</p>
          </div>
          {value.blocks.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-fg-muted">{t.empty}</p>
          ) : (
            <SortableList
              aria-label={t.blocks}
              items={value.blocks}
              getId={(b) => b.id}
              itemLabel={(b, i) => fill(t.blockN, { n: i + 1, type: t[b.type] })}
              onReorder={setBlocks}
              renderItem={(b, parts) => {
                const Icon = ICON[b.type];
                const open = openId === b.id;
                const label = fill(t.blockN, { n: parts.index + 1, type: t[b.type] });
                return (
                  <div className={cn("rounded-md border bg-surface", open ? "border-primary ring-1 ring-primary" : "border-border")}>
                    <div className="flex items-center gap-2 px-2 py-1.5">
                      {parts.handle}
                      <IconTile icon={<Icon />} size="sm" tone={open ? "primary" : "neutral"} />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="min-w-0 flex-1 justify-start px-2 text-left font-normal"
                        aria-expanded={b.type === "divider" ? undefined : open}
                        aria-label={`${t.edit} – ${label}`}
                        onClick={() => setOpenId(open ? null : b.id)}
                      >
                        <span className="truncate text-sm text-fg">{summary(b, t)}</span>
                      </Button>
                      <Button type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label={`${t.duplicate} – ${label}`} title={t.duplicate}
                        onClick={() => {
                          const i = value.blocks.findIndex((x) => x.id === b.id);
                          setBlocks([...value.blocks.slice(0, i + 1), { ...b, id: newBlockId() }, ...value.blocks.slice(i + 1)]);
                        }}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-danger-subtle-fg" aria-label={`${t.remove} – ${label}`} title={t.remove}
                        onClick={() => setBlocks(value.blocks.filter((x) => x.id !== b.id))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    {open && b.type !== "divider" && (
                      <div className="border-t border-border px-3 py-3">
                        <BlockEditor b={b} t={t} onChange={(next) => setBlocks(value.blocks.map((x) => (x.id === b.id ? next : x)))} />
                        <div className="mt-3 flex justify-end">
                          <Button type="button" size="sm" variant="secondary" onClick={() => setOpenId(null)}>{t.done}</Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              }}
            />
          )}
        </div>
        {aside}
      </Stack>
      <Stack gap="sm" className="min-w-0 cq-xl:sticky cq-xl:top-shell cq-xl:self-start">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-fg">{t.preview}</p>
          <SegmentedControl label={t.preview} hideLabel value={device} onChange={setDevice} options={[{ value: "desktop", label: t.desktop }, { value: "mobile", label: t.mobile }]} />
        </div>
        <HtmlPreview title={t.previewTitle} html={preview} device={device} className="h-176" />
        <p className="text-xs text-fg-muted">{fill(t.previewNote, { name: t.sampleName, org: t.sampleOrg })}</p>
      </Stack>
    </Grid>
  );
}
