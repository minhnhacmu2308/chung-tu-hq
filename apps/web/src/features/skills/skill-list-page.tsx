"use client";
import {
  Alert, Badge, Button, Card, CardDescription, CardHeader, CardTitle, createDataTableColumnHelper, DataTable, Grid, PageHeader,
  Skeleton, Stack, Switch, Tabs, TabsContent, TabsList, TabsTrigger, toast,
} from "@kb/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo } from "react";
import { listSkills, setSkillEnabled, skillKeys } from "@/api/skills";
import { formatNumber, formatRelative } from "@/lib/format";
import { DOC_KIND_LABELS, type Skill, type SkillKind } from "@/mocks/types";
import { AccuracyBadge, formatPercent, SKILL_KIND_LABELS } from "./skill-display";

const KINDS: SkillKind[] = ["DOCUMENT", "SUPPLIER", "MAPPING"];
const KIND_HINT: Record<SkillKind, string> = {
  DOCUMENT: "Cách đọc từng loại chứng từ: trường cần lấy, nhãn thường gặp (alias), mẫu đã gắn nhãn.",
  SUPPLIER: "Skill riêng cho nhà cung cấp có mẫu chứng từ đặc thù – được ưu tiên hơn skill chung khi nhận ra nhà cung cấp.",
  MAPPING: "Quy tắc đưa dữ liệu lô hàng vào chỉ tiêu tờ khai VNACCS. Là code + cấu hình, không dùng AI.",
};

function EnabledSwitch({ skill }: { skill: Skill }) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (v: boolean) => setSkillEnabled(skill.id, v),
    onSuccess: (s) => {
      void qc.invalidateQueries({ queryKey: skillKeys.all });
      toast({ tone: "success", title: s.enabled ? `Đã bật ${s.code}` : `Đã tắt ${s.code}` });
    },
    onError: (e: Error) => toast({ tone: "danger", title: "Không đổi được trạng thái", description: e.message }),
  });
  return (
    <Switch
      checked={m.isPending ? !!m.variables : skill.enabled}
      onCheckedChange={(v) => m.mutate(v)}
      disabled={m.isPending}
      aria-label={`Bật skill ${skill.code}`}
    />
  );
}

const col = createDataTableColumnHelper<Skill>();

function columnsFor(kind: SkillKind) {
  return col.columns([
    col.accessor("code", {
      header: "Mã skill",
      meta: { hideable: false },
      cell: (c) => (
        <Link href={`/skills/${c.row.original.id}`} className="font-mono text-xs font-medium text-primary hover:underline">
          {c.getValue()}
        </Link>
      ),
    }),
    col.accessor("name", {
      header: "Tên",
      meta: { wrap: true },
      cell: (c) => (
        <div className="min-w-48">
          <p className="font-medium text-fg">{c.getValue()}</p>
          {c.row.original.supplier && <p className="text-xs text-fg-subtle">{c.row.original.supplier}</p>}
        </div>
      ),
    }),
    ...(kind === "MAPPING"
      ? [col.accessor((s) => s.fields.length, { id: "rules", header: "Số chỉ tiêu", meta: { align: "end" } })]
      : [
          col.accessor((s) => (s.docKind ? DOC_KIND_LABELS[s.docKind] : "—"), { id: "docKind", header: "Loại chứng từ" }),
          col.accessor("language", { header: "Ngôn ngữ", meta: { wrap: true } }),
          col.accessor((s) => s.accuracy ?? -1, {
            id: "accuracy",
            header: "Độ chính xác",
            cell: (c) => <AccuracyBadge skill={c.row.original} />,
          }),
          col.accessor("labeledSamples", { header: "Mẫu", meta: { align: "end", label: "Mẫu đã gắn nhãn" }, cell: (c) => formatNumber(c.getValue()) }),
        ]),
    col.accessor("version", { header: "Bản", meta: { align: "end", label: "Phiên bản" }, cell: (c) => `v${c.getValue()}` }),
    col.accessor("updatedAt", { header: "Cập nhật", cell: (c) => <span className="text-fg-muted">{formatRelative(c.getValue())}</span> }),
    col.accessor("enabled", { header: "Bật", meta: { label: "Đang dùng" }, enableSorting: false, cell: (c) => <EnabledSwitch skill={c.row.original} /> }),
  ]);
}

function Kpis({ skills }: { skills: Skill[] }) {
  const reading = skills.filter((s) => s.kind !== "MAPPING");
  const measured = reading.filter((s) => s.accuracy !== undefined);
  const avg = measured.length ? measured.reduce((a, s) => a + (s.accuracy ?? 0), 0) / measured.length : undefined;
  const items: [string, string, string][] = [
    ["Skill đang dùng", `${skills.filter((s) => s.enabled).length}/${skills.length}`, "đọc chứng từ + ánh xạ tờ khai"],
    ["Độ chính xác trung bình", avg === undefined ? "—" : formatPercent(avg), `đo trên ${measured.length} skill có đủ mẫu`],
    ["Mẫu đã gắn nhãn", formatNumber(reading.reduce((a, s) => a + s.labeledSamples, 0)), "làm ví dụ cho AI + bộ đo"],
    ["Cần thêm mẫu", String(reading.filter((s) => s.accuracy === undefined || s.accuracy < 0.9).length), "skill dưới 90% hoặc chưa đo"],
  ];
  return (
    <Grid cols={{ base: 2, xl: 4 }}>
      {items.map(([t, v, s]) => (
        <Card key={t}>
          <CardHeader>
            <CardDescription>{t}</CardDescription>
            <CardTitle as="h3" className="text-2xl">{v}</CardTitle>
            <p className="text-xs text-fg-subtle">{s}</p>
          </CardHeader>
        </Card>
      ))}
    </Grid>
  );
}

function SkillListInner() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const raw = params.get("kind");
  const kind: SkillKind = KINDS.includes(raw as SkillKind) ? (raw as SkillKind) : "DOCUMENT";
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: skillKeys.list, queryFn: () => listSkills() });
  const columns = useMemo(() => ({ DOCUMENT: columnsFor("DOCUMENT"), SUPPLIER: columnsFor("SUPPLIER"), MAPPING: columnsFor("MAPPING") }), []);

  const setKind = (k: string) => router.replace(`${pathname}?kind=${k}`, { scroll: false });

  return (
    <Stack gap="lg">
      <PageHeader
        title="Cấu hình Skill AI"
        description="Mỗi skill quy định AI đọc loại chứng từ nào, lấy những trường gì, và dữ liệu được đưa vào tờ khai ra sao. Độ chính xác đo trên mẫu chứng từ đã gắn nhãn của chính doanh nghiệp."
      />
      {isError ? (
        <Alert
          tone="danger"
          title="Không tải được danh sách skill"
          action={<Button size="sm" variant="secondary" leftIcon={<RefreshCw className="h-4 w-4" />} onClick={() => refetch()}>Thử lại</Button>}
        >
          Kiểm tra kết nối rồi thử lại.
        </Alert>
      ) : isLoading || !data ? (
        <Grid cols={{ base: 2, xl: 4 }}>
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}
        </Grid>
      ) : (
        <Kpis skills={data} />
      )}
      <Tabs value={kind} onValueChange={setKind}>
        <TabsList aria-label="Nhóm skill">
          {KINDS.map((k) => (
            <TabsTrigger key={k} value={k}>
              {SKILL_KIND_LABELS[k]} {data && <Badge tone="neutral">{data.filter((s) => s.kind === k).length}</Badge>}
            </TabsTrigger>
          ))}
        </TabsList>
        {KINDS.map((k) => (
          <TabsContent key={k} value={k}>
            <Stack gap="md" className="pt-4">
              <p className="text-sm text-fg-muted">{KIND_HINT[k]}</p>
              <DataTable
                aria-label={SKILL_KIND_LABELS[k]}
                columns={columns[k]}
                data={data?.filter((s) => s.kind === k) ?? []}
                getRowId={(s) => s.id}
                loading={isLoading}
                searchable
                onRowClick={(s) => router.push(`/skills/${s.id}`)}
                pagination={false}
                emptyTitle="Chưa có skill"
                emptyDescription="Liên hệ quản trị để thêm skill cho nhóm này."
              />
            </Stack>
          </TabsContent>
        ))}
      </Tabs>
    </Stack>
  );
}

export function SkillListPage() {
  return (
    <Suspense>
      <SkillListInner />
    </Suspense>
  );
}
