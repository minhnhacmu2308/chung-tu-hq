"use client";
// Lưu ý phân loại HS dạng NoticeChip: trong ô (theo cột) và khối "Lưu ý chung" trên đầu bảng.
import { Grid, IconTile, NoticeChip, fill, useMessages, type NoticeItem } from "@kb/ui";
import { Landmark, Layers, Receipt, Tags } from "lucide-react";
import { lineRanges, ministryShort, policyItem, type Notice, type SharedNotice } from "./hs-notices";
import { HS_NOTICE_MESSAGES } from "./hs-notices.messages";

type NoticeText = Record<keyof (typeof HS_NOTICE_MESSAGES)["vi"], string>;

function chipText(n: Notice, t: NoticeText): { label: string; title?: string } {
  const p = n.params ?? {};
  if (n.code === "SPECIALIZED_POLICY") {
    return p.ministry
      ? { label: fill(t.SPECIALIZED_POLICY, { ministry: ministryShort(p.ministry) }), title: fill(t.SPECIALIZED_POLICY_TITLE, { ministry: p.ministry }) }
      : { label: t.SPECIALIZED_POLICY_NO_MINISTRY };
  }
  if (n.code === "FTA_LAST_PERIOD") return { label: p.agreement ? fill(t.FTA_LAST_PERIOD, { agreement: p.agreement }) : t.FTA_LAST_PERIOD_NO_AGREEMENT };
  const key = n.code in t ? (n.code as keyof NoticeText) : "OTHER";
  return { label: fill(t[key], { pct: p.pct ?? "", invoiceHs: p.invoiceHs ?? "", agreement: p.agreement ?? "FTA" }) };
}

/** Câu đầy đủ + từng mục: quản lý chuyên ngành tách mục chính / văn bản căn cứ; mục khác giữ nguyên câu. */
function body(n: Notice): { description?: string; items: NoticeItem[] } {
  if (n.code === "SPECIALIZED_POLICY") return { items: (n.items ?? [n.text]).map(policyItem) };
  if (n.items && n.items.length > 1) return { items: n.items.map((text) => ({ text })) };
  if (n.items?.length === 1 && n.items[0] !== n.text) return { description: n.text, items: [{ text: n.items[0]! }] };
  return { description: n.text, items: [] };
}

const GROUP_ICON = { classification: Tags, tax: Receipt, policy: Landmark } as const;

export function HsNoticeChip({ notice, lines, tile = false }: { notice: Notice; lines?: number[]; tile?: boolean }) {
  const t = useMessages(HS_NOTICE_MESSAGES);
  const Icon = GROUP_ICON[notice.group];
  const { label, title } = chipText(notice, t);
  const { description, items } = body(notice);
  return (
    <NoticeChip
      tone={notice.level}
      label={label}
      items={items}
      {...(title ? { title } : {})}
      {...(description ? { description } : {})}
      {...(lines ? { count: lines.length, meta: fill(t.appliesTo, { lines: lineRanges(lines) }) } : {})}
      {...(tile ? { variant: "tile" as const, icon: <Icon />, ...(lines ? { subtitle: fill(t.linesShort, { lines: lineRanges(lines) }) } : {}) } : {})}
    />
  );
}

/** Lưu ý của một ô: mức nặng trước (danger → warning → info); xếp dọc, các chip rộng bằng chip dài nhất (mũi tên thẳng hàng). */
export function HsNoticeList({ notices }: { notices: Notice[] }) {
  if (notices.length === 0) return null;
  const order = { danger: 0, warning: 1, info: 2 } as const;
  return (
    <div className="inline-flex max-w-full flex-col gap-1">
      {[...notices].sort((a, b) => order[a.level] - order[b.level]).map((n) => <HsNoticeChip key={`${n.code}|${n.text}`} notice={n} />)}
    </div>
  );
}

/** Khối trên đầu bảng: lưu ý lặp trên nhiều dòng, nói một lần kèm "Áp dụng cho dòng …". */
export function SharedHsNotices({ shared }: { shared: SharedNotice[] }) {
  const t = useMessages(HS_NOTICE_MESSAGES);
  if (shared.length === 0) return null;
  const n = new Set(shared.flatMap((s) => s.lines)).size;
  return (
    <section aria-label={fill(t.sharedTitle, { n })} className="mb-3 rounded-lg border border-warning/25 bg-warning-subtle/40 p-3">
      <div className="mb-3 flex items-start gap-2.5">
        <IconTile size="sm" tone="warning" icon={<Layers />} />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-fg">{fill(t.sharedTitle, { n })}</p>
          <p className="text-xs text-fg-muted">{t.sharedHint}</p>
        </div>
      </div>
      <Grid cols={{ base: 1, md: 2, xl: 3 }} gap="sm">
        {shared.map((s) => <HsNoticeChip key={`${s.notice.code}|${s.notice.text}`} notice={s.notice} lines={s.lines} tile />)}
      </Grid>
    </section>
  );
}
