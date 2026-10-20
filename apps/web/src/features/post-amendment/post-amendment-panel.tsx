"use client";
// Bước 5, tab "Khai bổ sung AMA": bản khai bổ sung sau thông quan – bản riêng tham chiếu tờ khai gốc (tờ khai gốc giữ nguyên, khóa).
// Bố cục theo phần mềm khai báo (CHIEUTIEU_AMA_NHAP_XUAT.docx): Thông tin tờ khai · Danh sách hàng (panel Trước/Sau) · Thông điệp HQ.
// "Trước" lấy từ tờ khai gốc + số Hải quan trả về, chỉ đọc; "Sau" người khai sửa, tiền thuế "Sau" tự tính lại (@kb/contracts recalcAmaLine).
import {
  Alert, Button, createDataTableColumnHelper, DataTable, Dialog, DialogContent, DialogFooter, EmptyState, Checkbox, Field, Grid, RowActions,
  Select, SkeletonCard, Stack, StatusBadge, Tabs, TabsContent, TabsList, TabsTrigger, toast,
} from "@kb/ui";
import {
  AMA_HEADER_LAYOUT, amaHeaderLocked, amaLineDelta, HEADER_LOCK_REASON, postAmendmentEditable, processingContractNote,
  type CustomsMessage, type PostAmendmentLine, type PostAmendmentStatus,
} from "@kb/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FilePlus2, FileX2, ListPlus, MessageSquareText, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { customsKeys } from "@/api/customs";
import { dossierKeys } from "@/api/dossiers";
import {
  addPostAmendmentLines, approvePostAmendment, getPostAmendmentView, postAmendmentKeys, removePostAmendmentLine, updatePostAmendmentField,
} from "@/api/post-amendment";
import { LoadError } from "@/components/common/load-error";
import { formatDate, formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { toastMutationError } from "@/lib/mutation-error";
import { AmendLockProvider, type FieldLockLookup } from "../declaration-form/amend-context";
import { BlockView } from "../declaration-form/block-view";
import { conditionContext, type FormValues } from "../declaration-form/form-state";
import { ViewPrefsProvider } from "../declaration-form/view-prefs";
import { StickyActionBar } from "../dossier-detail/steps/declaration-parts";
import { AmaLinePanel } from "./ama-line-panel";

type Props = {
  dossierId: string;
  kind: "IDA" | "EDA";
  canEdit: boolean;
  /** Nguyên tắc 4 mắt: người tạo hồ sơ không tự duyệt. */
  blockedByFourEyes: boolean;
  /** Thông điệp Hải quan của hồ sơ (lọc AMA/AMB/AMC). */
  messages: CustomsMessage[];
  onGoSubmit: () => void;
};

const STATUS: Record<PostAmendmentStatus, "AMA_DRAFT" | "AMA_APPROVED" | "AMA_PRE_DECLARED" | "AMA_RECALLED" | "AMA_REGISTERED"> = {
  DRAFT: "AMA_DRAFT", APPROVED: "AMA_APPROVED", PRE_DECLARED: "AMA_PRE_DECLARED", RECALLED: "AMA_RECALLED", REGISTERED: "AMA_REGISTERED",
};
const LOCKED_ALL = { basis: "SOFTWARE", reason: "" } as const;

type Row = PostAmendmentLine;
const col = createDataTableColumnHelper<Row>();
const money = (v: string | undefined) => (v?.trim() ? formatMoney(v, undefined, 0) : "—");
const signed = (v: string | null) => (v === null ? "—" : `${v.startsWith("-") ? "−" : "+"}${formatMoney(v.replace("-", ""), undefined, 0)}`);

/** Thay đổi đang sửa dở của đầu bản khai so với bản đã lưu. */
const headerEdits = (saved: FormValues, draft: FormValues) => Object.keys(draft).filter((k) => (draft[k] ?? "") !== (saved[k] ?? ""));

export function PostAmendmentPanel({ dossierId, kind, canEdit, blockedByFourEyes, messages, onGoSubmit }: Props) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: postAmendmentKeys.view(dossierId), queryFn: () => getPostAmendmentView(dossierId) });
  const [tab, setTab] = useState("info");
  const [openLine, setOpenLine] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);

  const a = q.data?.current ?? q.data?.history[0] ?? null;
  const saved = useMemo<FormValues>(() => a?.header ?? {}, [a]);
  const [draft, setDraft] = useState<FormValues>(saved);
  const savedKey = JSON.stringify(saved);
  useEffect(() => setDraft(saved), [savedKey]);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: postAmendmentKeys.view(dossierId) });
    void qc.invalidateQueries({ queryKey: customsKeys.submission(dossierId) });
    void qc.invalidateQueries({ queryKey: dossierKeys.all });
  };
  const saveHeader = useMutation({
    mutationFn: async (keys: string[]) => {
      for (const key of keys) await updatePostAmendmentField(dossierId, { key, value: draft[key] ?? "" });
    },
    onSuccess: (_d, keys) => toast({ tone: "success", title: `Đã lưu ${formatNumber(keys.length)} chỉ tiêu` }),
    onError: toastMutationError("Không lưu được bản khai bổ sung"),
    onSettled: refresh,
  });
  const addLine = useMutation({
    mutationFn: (lineNos: number[]) => addPostAmendmentLines(dossierId, lineNos),
    onSuccess: (pa, lineNos) => {
      setAddOpen(false);
      // Một dòng → mở luôn panel dòng; nhiều dòng → báo đã thêm, người khai bấm từng dòng để sửa.
      if (lineNos.length === 1) setOpenLine(pa.lines.find((l) => l.ran === lineNos[0])?.id ?? null);
      else toast({ tone: "success", title: `Đã thêm ${formatNumber(lineNos.length)} dòng vào bản khai bổ sung` });
      refresh();
    },
    onError: toastMutationError("Không thêm được dòng hàng"),
  });
  const removeLine = useMutation({
    mutationFn: (lineId: string) => removePostAmendmentLine(dossierId, lineId),
    onSuccess: () => {
      toast({ tone: "success", title: "Đã bỏ dòng khỏi bản khai bổ sung" });
      refresh();
    },
    onError: toastMutationError("Không bỏ được dòng hàng"),
  });
  const approve = useMutation({
    mutationFn: () => approvePostAmendment(dossierId),
    onSuccess: () => {
      setApproveOpen(false);
      toast({ tone: "success", title: "Đã phê duyệt bản khai bổ sung", description: "Sang bước Khai báo Hải quan để khai tạm AMA." });
      refresh();
      onGoSubmit();
    },
    onError: toastMutationError("Không phê duyệt được bản khai bổ sung"),
  });

  if (q.isLoading) return <SkeletonCard lines={6} />;
  if (q.isError) return <LoadError onRetry={() => void q.refetch()} />;
  if (!a) {
    return (
      <EmptyState
        icon={<FilePlus2 />}
        title="Chưa lập bản khai bổ sung"
        description="Tờ khai đã thông quan muốn sửa thì lập bản khai bổ sung AMA ở bước Khai báo Hải quan (Bắt đầu sửa sau thông quan). Tờ khai gốc giữ nguyên."
        action={<Button onClick={onGoSubmit}>Sang khai báo Hải quan</Button>}
      />
    );
  }

  const editable = canEdit && a.status !== "REGISTERED" && postAmendmentEditable(a.status) && a === q.data?.current;
  const pending = editable ? headerEdits(saved, draft) : [];
  // Số tờ khai bổ sung (TK_SYN) là ô Hải quan cấp – chỉ đọc theo origin, không ghi "theo tờ khai gốc".
  const headerLock: FieldLockLookup = (key) => (!editable ? LOCKED_ALL : key === "TK_SYN" ? null : amaHeaderLocked(key) ? { basis: "SOFTWARE", reason: HEADER_LOCK_REASON } : null);
  const line = a.lines.find((l) => l.id === openLine) ?? null;
  const used = new Set(a.lines.map((l) => l.ran));
  const free = (q.data?.sourceLines ?? []).filter((s) => !used.has(s.lineNo));
  const amaMessages = messages.filter((m) => m.operation === "AMA" || m.operation === "AMB" || m.operation === "AMC");
  const contracts = q.data?.contracts ?? [];

  const columns = col.columns([
    col.display({ id: "ran", header: "Dòng gốc", size: 72, meta: { align: "center" }, cell: (c) => c.row.original.values["HAG_RAN"] ?? String(c.row.original.ran) }),
    col.display({ id: "mo-ta", header: "Mô tả hàng hóa (sau)", size: 260, meta: { wrap: true }, cell: (c) => c.row.original.values["HAG_CMA"] || "—" }),
    col.display({ id: "hs", header: "Mã HS trước → sau", cell: (c) => `${c.row.original.values["HAG_MKT"] || "—"} → ${c.row.original.values["HAG_AKT"] || "—"}` }),
    col.display({ id: "thue", header: "Thuế XNK trước → sau", meta: { align: "end" }, cell: (c) => `${money(c.row.original.values["HAG_MKA"])} → ${money(c.row.original.values["HAG_AKA"])}` }),
    col.display({
      id: "tang-giam", header: "Tăng/giảm thuế", meta: { align: "end" },
      cell: (c) => {
        const d = amaLineDelta(c.row.original.values);
        return [d.importTax, ...d.other.map((o) => o.amount)].filter((x) => x !== null).map((x) => signed(x)).join(" · ") || "—";
      },
    }),
  ]);

  const statusNote: Record<PostAmendmentStatus, string> = {
    DRAFT: "Chọn dòng hàng cần bổ sung, sửa phần Sau, rồi phê duyệt để khai tạm AMA ở bước Khai báo Hải quan.",
    APPROVED: `Đã phê duyệt${a.approvedBy ? ` bởi ${a.approvedBy}` : ""}${a.approvedAt ? ` lúc ${formatDateTime(a.approvedAt)}` : ""}. Sửa tiếp thì phải phê duyệt lại.`,
    PRE_DECLARED: "Đã khai tạm AMA – bản khai chỉ xem. Muốn sửa: gọi về (AMB) ở bước Khai báo Hải quan; không sửa thì khai chính thức (AMC).",
    RECALLED: "Bản khai đã gọi về (AMB) – sửa, phê duyệt lại rồi khai tạm AMA lại.",
    REGISTERED: "Đã khai chính thức AMC – bản khai bổ sung khóa toàn bộ.",
  };

  return (
    <ViewPrefsProvider>
      <Stack gap="md">
        <Alert
          tone={pending.length ? "warning" : a.status === "REGISTERED" ? "success" : "info"}
          title={pending.length ? `Có ${formatNumber(pending.length)} chỉ tiêu chưa lưu` : `Bản khai bổ sung sau thông quan lần ${a.seq}`}
          action={<StatusBadge status={STATUS[a.status]} />}
        >
          <p>{statusNote[a.status]} Tờ khai gốc giữ nguyên, không sửa trực tiếp.</p>
          {pending.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" loading={saveHeader.isPending} onClick={() => saveHeader.mutate(pending)}>
                Lưu {formatNumber(pending.length)} thay đổi
              </Button>
              <Button size="sm" variant="ghost" disabled={saveHeader.isPending} onClick={() => setDraft(saved)}>
                Hoàn tác
              </Button>
            </div>
          )}
        </Alert>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList aria-label="Bản khai bổ sung AMA">
            <TabsTrigger value="info">Thông tin tờ khai</TabsTrigger>
            <TabsTrigger value="lines">Danh sách hàng ({formatNumber(a.lines.length)})</TabsTrigger>
            <TabsTrigger value="messages">Thông điệp HQ</TabsTrigger>
          </TabsList>

          <TabsContent value="info">
            <AmendLockProvider kind={kind} values={draft} active={false} override={headerLock}>
              <div className="@container flex min-w-0 flex-col gap-3">
                {AMA_HEADER_LAYOUT.map((b) => (
                  <BlockView
                    key={b.id}
                    kind={kind}
                    block={b}
                    values={draft}
                    onChange={editable ? (k, v) => setDraft((d) => ({ ...d, [k]: v })) : undefined}
                    ctx={conditionContext(kind, draft)}
                    showInapplicable={false}
                  />
                ))}
                {editable && contracts.length > 0 && (
                  <div className="flex flex-wrap items-end gap-2">
                    <Field label="Hợp đồng gia công" hint="Chọn để chèn số và ngày hợp đồng vào ghi chú sau khai bổ sung">
                      <Select
                        className="cq-sm:w-72"
                        placeholder="Chọn hợp đồng…"
                        options={contracts.map((c) => ({ value: c.no, label: c.date ? `${c.no} · ${formatDate(c.date)}` : c.no }))}
                        value={draft["APP_HD_GC"] ?? ""}
                        onChange={(e) => {
                          const no = e.currentTarget.value;
                          const c = contracts.find((x) => x.no === no);
                          setDraft((d) => {
                            const note = c ? processingContractNote(c.no, c.date) : "";
                            const current = d["TK_NTA"] ?? "";
                            return { ...d, APP_HD_GC: no, ...(note && !current.includes(note) ? { TK_NTA: current.trim() ? `${current.trim()}\n${note}` : note } : {}) };
                          });
                        }}
                      />
                    </Field>
                  </div>
                )}
              </div>
            </AmendLockProvider>
          </TabsContent>

          <TabsContent value="lines">
            <Stack gap="sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-fg-muted">
                  {a.lines.length ? "Bấm vào dòng để xem Trước / Sau và sửa phần Sau." : "Chưa có dòng hàng – chọn dòng của tờ khai gốc cần khai bổ sung."}
                </p>
                {editable && (
                  <Button size="sm" variant="secondary" leftIcon={<ListPlus className="h-4 w-4" />} disabled={!free.length} onClick={() => setAddOpen(true)}>
                    Thêm dòng từ tờ khai gốc
                  </Button>
                )}
              </div>
              {a.lines.length > 0 && (
                <DataTable
                  aria-label="Dòng hàng khai bổ sung"
                  columns={columns}
                  data={a.lines}
                  getRowId={(r) => r.id}
                  onRowClick={(r) => setOpenLine(r.id)}
                  rowLabel={(r) => `Dòng ${r.ran}`}
                  {...(editable
                    ? {
                        rowActions: (r: Row) => (
                          <RowActions
                            rowLabel={`Dòng ${r.ran}`}
                            actions={[{ id: "bo", label: "Bỏ khỏi bản khai", icon: <Trash2 className="h-4 w-4" />, tone: "danger", onSelect: () => removeLine.mutate(r.id) }]}
                          />
                        ),
                      }
                    : {})}
                />
              )}
            </Stack>
          </TabsContent>

          <TabsContent value="messages">
            <Stack gap="md">
              {a.result && (
                <Grid cols={{ base: 1, md: 2 }} gap="sm" className="rounded-md border border-border px-4 py-3 text-sm">
                  <p><span className="text-fg-muted">Số tờ khai bổ sung:</span> <span className="font-mono">{a.result["TK_SYN"] || "—"}</span></p>
                  <p><span className="text-fg-muted">Số thông báo:</span> <span className="font-mono">{a.result["TK_ADD"] || "—"}</span></p>
                  <p><span className="text-fg-muted">Ngày đăng ký khai bổ sung:</span> {a.result["TK_A02"] ? formatDate(a.result["TK_A02"]) : "—"}</p>
                  <p><span className="text-fg-muted">Tổng tiền thuế tăng/giảm:</span> {a.result["TK_A23"] ? `${a.result["TK_ADB"] === "-" ? "−" : "+"}${formatMoney(a.result["TK_A23"], "VND", 0)}` : "—"}</p>
                  {a.result["TK_ADE"] && <p className="text-warning-subtle-fg">Quá 60 ngày kể từ ngày thông quan</p>}
                </Grid>
              )}
              {amaMessages.length ? (
                <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
                  {amaMessages.map((m) => (
                    <li key={m.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
                      <MessageSquareText aria-hidden="true" className="mt-0.5 h-4 w-4 text-fg-subtle" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-fg">
                          <span className="font-mono font-medium">{m.operation}</span> · {m.direction === "OUT" ? "Gửi đi" : "Nhận về"} – {m.summary}
                        </p>
                        <p className="text-xs text-fg-muted">{formatDateTime(m.at)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState icon={<MessageSquareText />} title="Chưa có thông điệp" description="Thông điệp gửi/nhận của AMA, AMB, AMC hiện ở đây sau khi khai ở bước Khai báo Hải quan." />
              )}
            </Stack>
          </TabsContent>
        </Tabs>
      </Stack>

      <StickyActionBar>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-fg-muted">Bản khai bổ sung lần {a.seq}</p>
          <p className="text-sm font-medium text-fg">{formatNumber(a.lines.length)} dòng hàng · lý do {a.header["TK_REC"] || "chưa nhập"}</p>
        </div>
        {editable && a.status !== "APPROVED" ? (
          <Button leftIcon={<ShieldCheck className="h-4 w-4" />} disabled={blockedByFourEyes || pending.length > 0 || !a.lines.length || !a.header["TK_REC"]?.trim()} onClick={() => setApproveOpen(true)}>
            Phê duyệt bản khai
          </Button>
        ) : (
          <Button onClick={onGoSubmit}>Sang khai báo Hải quan</Button>
        )}
      </StickyActionBar>

      <AmaLinePanel
        kind={kind}
        line={line}
        editable={editable}
        dossierId={dossierId}
        onClose={() => setOpenLine(null)}
        onSaved={refresh}
      />

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent title="Thêm dòng từ tờ khai gốc" icon={<ListPlus className="h-4 w-4" />} description="Phần Trước lấy theo tờ khai gốc và số Hải quan trả về; phần Sau ban đầu bằng Trước." size="sm">
          <AddLineForm options={free} loading={addLine.isPending} onCancel={() => setAddOpen(false)} onAdd={(ns) => addLine.mutate(ns)} />
        </DialogContent>
      </Dialog>

      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogContent title="Phê duyệt bản khai bổ sung" icon={<ShieldCheck className="h-4 w-4" />} description={`Lần ${a.seq} · ${formatNumber(a.lines.length)} dòng hàng`} size="sm">
          <p className="text-sm text-fg-muted">Sau khi phê duyệt, bản khai được khóa để khai tạm AMA. Sửa tiếp phải phê duyệt lại. Hạn khai bổ sung: 60 ngày kể từ ngày thông quan (TT121 Điều 20).</p>
          {blockedByFourEyes && <Alert tone="info">Doanh nghiệp bật nguyên tắc 4 mắt – nhờ Người duyệt khác hoặc Chủ sở hữu phê duyệt.</Alert>}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setApproveOpen(false)}>
              Hủy
            </Button>
            <Button loading={approve.isPending} onClick={() => approve.mutate()}>
              Phê duyệt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ViewPrefsProvider>
  );
}

/** Chọn một hoặc nhiều dòng của tờ khai gốc cần khai bổ sung (AMA sửa được nhiều dòng cùng lúc). */
function AddLineForm({ options, loading, onCancel, onAdd }: { options: { lineNo: number; description: string; hsCode: string }[]; loading: boolean; onCancel: () => void; onAdd: (lineNos: number[]) => void }) {
  const [picked, setPicked] = useState<number[]>([]);
  if (!options.length) return <EmptyState icon={<FileX2 />} title="Đã chọn hết dòng của tờ khai gốc" />;
  const all = picked.length === options.length;
  const toggle = (n: number) => setPicked((p) => (p.includes(n) ? p.filter((x) => x !== n) : [...p, n]));
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (picked.length) onAdd([...picked].sort((a, b) => a - b));
      }}
    >
      <fieldset className="flex min-w-0 flex-col gap-3">
        <legend className="mb-2 text-sm font-medium text-fg">Dòng hàng trên tờ khai gốc</legend>
        {options.length > 1 && (
          <Checkbox label={`Chọn tất cả (${formatNumber(options.length)} dòng)`} checked={all} onChange={() => setPicked(all ? [] : options.map((o) => o.lineNo))} />
        )}
        {options.map((o) => (
          <Checkbox
            key={o.lineNo}
            checked={picked.includes(o.lineNo)}
            onChange={() => toggle(o.lineNo)}
            label={
              <span className="flex min-w-0 flex-col">
                <span>Dòng {o.lineNo} · HS {o.hsCode || "—"}</span>
                <span className="text-xs text-fg-muted">{o.description}</span>
              </span>
            }
          />
        ))}
      </fieldset>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Hủy
        </Button>
        <Button type="submit" loading={loading} disabled={!picked.length}>
          {picked.length ? `Thêm ${formatNumber(picked.length)} dòng` : "Thêm dòng"}
        </Button>
      </DialogFooter>
    </form>
  );
}
