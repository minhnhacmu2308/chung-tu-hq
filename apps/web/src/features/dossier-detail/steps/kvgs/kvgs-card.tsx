"use client";
// Thẻ "Qua khu vực giám sát" (spec KVGS §3) trong ④ Chứng từ & cảng của bước Truyền Hải quan – mỗi tờ khai nhánh một thẻ (anchor #kvgs-<tờ>).
// Khối 1 "Khai danh sách container" (chỉ NK container) + khối 2 "Lấy DS qua KVGS"; bảng container sửa trực tiếp (lưu nháp → khai),
// hộp xác nhận trước khi gửi (doanh nghiệp + nơi nhận), tự hỏi lại 2 giây/lần khi đang gửi, lỗi Hải quan theo dòng, In bản kê.
// Bấm được hay không theo customs-flow (dòng CONT_LIST / KVGS của tờ trong bản truyền) – màn chỉ hiển thị; backend chặn lần nữa.
import {
  Alert, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, ConfirmDialog, Dialog, DialogContent, FileDropzone, fill, Grid, IconTile, RowActions,
  SkeletonList, Spinner, Stack, toast, useMessages, useUiLocale,
} from "@kb/ui";
import { baseOp, checkContainerList, type ContainerListRow, type KvgsView, type Role } from "@kb/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileSpreadsheet, History, PenLine, Plus, Printer, RefreshCw, Send, Trash2, Truck } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { customsKeys, getSubmission } from "@/api/customs";
import { fetchKvgs, getKvgs, kvgsKeys, pollNow, refillContainerList, saveContainerList, sendContainerList } from "@/api/kvgs";
import { LoadError } from "@/components/common/load-error";
import { formatDate, formatDateTime } from "@/lib/format";
import { toastMutationError } from "@/lib/mutation-error";
import { rowReason } from "@/lib/reason-codes";
import { sheetsOf } from "../branch-sheets";
import { MessageList } from "../message-list";
import { ContainerTable, type EditRow } from "./container-table";
import { buildContainerXlsx, parseContainerXlsx, saveBlob } from "./container-xlsx";
import { KvgsStatusBlock } from "./kvgs-status-block";
import { KVGS_MESSAGES } from "./kvgs.messages";

/** Vai trò được gửi/sửa (như KVGS_ROLES của backend; OWNER luôn được). */
export const KVGS_EDITORS: ReadonlySet<Role> = new Set<Role>(["OWNER", "ADMIN", "DECLARANT", "APPROVER"]);
/** Anchor của thẻ – lối tắt "Qua khu vực giám sát" dẫn tới `?step=submit#kvgs-<tờ>`. */
export const kvgsAnchor = (branch: number) => `kvgs-${branch}`;

type Kind = "CONT_LIST" | "KVGS";
type Removal = { kind: "all" } | { kind: "row"; row: EditRow };

const strip = (rows: EditRow[]): ContainerListRow[] => rows.map(({ key: _k, n: _n, ...r }) => r);
const sending = (v: KvgsView | undefined) => v?.containerList?.status === "SENDING" || v?.kvgs?.status === "SENDING";

export type KvgsCardProps = {
  dossierId: string;
  branch: number;
  canEdit: boolean;
  /** Tên chi cục nơi nhận (hồ sơ) cho hộp xác nhận; thiếu → mã chi cục của tờ. */
  customsOfficeName?: string;
};

export function KvgsCard({ dossierId, branch, canEdit, customsOfficeName }: KvgsCardProps) {
  const t = useMessages(KVGS_MESSAGES);
  const locale = useUiLocale();
  const qc = useQueryClient();
  const key = kvgsKeys.detail(dossierId, branch);
  const q = useQuery({ queryKey: key, queryFn: () => getKvgs(dossierId, branch), refetchInterval: (s) => (sending(s.state.data) ? 2000 : false) });
  // Dòng CONT_LIST / KVGS của tờ (customs-flow): bấm được không + lý do khóa; nhật ký thông điệp của tờ.
  const subQ = useQuery({ queryKey: customsKeys.submission(dossierId), queryFn: () => getSubmission(dossierId) });
  const sheet = subQ.data ? sheetsOf(subQ.data).find((b) => b.no === branch) : undefined;
  const contRow = sheet?.pipeline.find((r) => baseOp(r.op) === "CONT_LIST");
  const kvgsRow = sheet?.pipeline.find((r) => baseOp(r.op) === "KVGS");

  const [draft, setDraft] = useState<EditRow[] | null>(null);
  const [reopen, setReopen] = useState(false);
  const [confirm, setConfirm] = useState<Kind | null>(null);
  const [removal, setRemoval] = useState<Removal | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const titleId = useId();
  const seq = useRef(0);
  const newKey = () => `n${++seq.current}`;

  const view = q.data;
  // Trạng thái đổi (Hải quan trả lời) → dòng CONT_LIST/KVGS của bản truyền đổi theo (KVGS mở khi danh sách được chấp nhận).
  const statusKey = view ? `${view.containerList?.attempt ?? 0}:${view.containerList?.status ?? "-"}:${view.kvgs?.status ?? "-"}` : undefined;
  useEffect(() => {
    if (statusKey) void qc.invalidateQueries({ queryKey: customsKeys.submission(dossierId) });
  }, [statusKey, qc, dossierId]);

  const put = (v: KvgsView) => qc.setQueryData(key, v);
  const save = useMutation({
    mutationFn: (rows: EditRow[]) => saveContainerList(dossierId, branch, { rows: strip(rows) }),
    onSuccess: (v) => {
      put(v);
      setDraft(null);
      setReopen(false);
      toast({ tone: "success", title: t.saved });
    },
    onError: toastMutationError(t.saveFailed),
  });
  const send = useMutation({
    mutationFn: async (kind: Kind) => {
      if (kind === "KVGS") return fetchKvgs(dossierId, branch);
      if (draft) put(await saveContainerList(dossierId, branch, { rows: strip(draft) }));
      return sendContainerList(dossierId, branch);
    },
    onSuccess: (v, kind) => {
      put(v);
      if (kind === "CONT_LIST") {
        setDraft(null);
        setReopen(false);
      }
      setConfirm(null);
      toast({ tone: "info", title: t.sent });
    },
    onError: (e) => {
      setConfirm(null);
      void q.refetch();
      toastMutationError(t.sendFailed)(e);
    },
  });
  const poll = useMutation({
    mutationFn: (kind: Kind) => pollNow(dossierId, branch, kind),
    onSettled: () => void qc.invalidateQueries({ queryKey: key }),
    onError: toastMutationError(t.pollFailed),
  });
  const refill = useMutation({
    mutationFn: () => refillContainerList(dossierId, branch),
    onSuccess: (v) => {
      put(v);
      setDraft(null);
      toast({ tone: "success", title: t.refilled });
    },
    onError: toastMutationError(t.refillFailed),
  });
  const exportXlsx = useMutation({
    mutationFn: (rows: ContainerListRow[]) => buildContainerXlsx(rows, locale),
    onSuccess: (blob) => {
      saveBlob(blob, `${view?.header.declarationNo ?? dossierId}-container.xlsx`);
      toast({ tone: "success", title: t.exported });
    },
    onError: toastMutationError(t.exportFailed),
  });
  const importXlsx = useMutation({
    mutationFn: async (file: File) => {
      const rows = await parseContainerXlsx(await file.arrayBuffer());
      if (!rows) throw new Error(t.importFailed);
      return rows;
    },
    onSuccess: (rows) => {
      setDraft(rows.map((r, i) => ({ ...r, key: newKey(), n: i + 1 })));
      setImportOpen(false);
      toast({ tone: "success", title: fill(t.imported, { n: rows.length }) });
    },
    onError: toastMutationError(t.importFailed),
  });

  const title = (
    <CardTitle as="h3" id={titleId} className="flex items-center gap-2">
      {t.cardTitle}
    </CardTitle>
  );
  if (q.isLoading) {
    return (
      <Card id={kvgsAnchor(branch)} aria-labelledby={titleId}>
        <CardHeader>{title}</CardHeader>
        <CardContent>
          <SkeletonList rows={2} />
        </CardContent>
      </Card>
    );
  }
  if (q.isError || !view) {
    return (
      <Card id={kvgsAnchor(branch)} aria-labelledby={titleId}>
        <CardHeader>{title}</CardHeader>
        <CardContent>
          <LoadError title={t.loadError} onRetry={() => void q.refetch()} />
        </CardContent>
      </Card>
    );
  }

  const list = view.containerList;
  const fetched = view.kvgs;
  const hasList = view.applies.containerList;
  const serverRows: EditRow[] = (list?.rows ?? []).map((r, i) => ({ ...r, key: `s${list?.attempt ?? 0}-${i}`, n: i + 1 }));
  const rows = draft ?? serverRows;
  const dirty = draft !== null;
  const listStatus = list?.status ?? null;
  const locked = listStatus === "SENDING" || (listStatus === "ACCEPTED" && !reopen);
  const editable = canEdit && hasList && !locked;
  const issues = hasList ? checkContainerList(strip(rows)) : [];
  const cellIssues = issues.filter((i) => i.row > 0);
  const errorLines = new Set((list?.errors ?? []).flatMap((e) => (e.line ? [e.line] : [])));
  const busy = save.isPending || send.isPending || refill.isPending;

  const edit = (next: EditRow[]) => setDraft(next.map((r, i) => ({ ...r, n: i + 1 })));
  const change = (k: string, field: "billNo" | "containerNo" | "sealNo" | "note", value: string) => edit(rows.map((r) => (r.key === k ? { ...r, [field]: value, source: "USER" as const } : r)));
  const addRow = () => edit([...rows, { billNo: rows.at(-1)?.billNo ?? "", containerNo: "", sealNo: "", note: "", source: "USER", key: newKey(), n: rows.length + 1 }]);

  const kvgsSheet = fetched?.sheet ?? null;
  // Bản kê lấy trước lần khai danh sách mới nhất (spec §5): vẫn in được nhưng ghi rõ "theo lần khai trước".
  const sheetOutdated = Boolean(kvgsSheet && fetched?.fetchedAt && list?.sentAt && list.sentAt > fetched.fetchedAt);
  const mau = kvgsSheet?.kind === "CONTAINER" ? "cont" : "le";

  const block1Note =
    contRow && !contRow.enabled ? rowReason(contRow, locale) : listStatus === "SENDING" ? t.sendingNote : listStatus === "NO_RESPONSE" ? t.noResponseNote : cellIssues.length > 0 || issues.some((i) => i.row === 0) ? (
      <span className="text-danger-subtle-fg">{cellIssues.length > 0 ? fill(t.issuesSummary, { n: cellIssues.length }) : t.issueEmpty}</span>
    ) : null;
  const block2Note =
    kvgsRow && !kvgsRow.enabled ? rowReason(kvgsRow, locale) : fetched?.status === "SENDING" ? t.sendingNote : fetched?.status === "NO_RESPONSE" ? t.noResponseNote : sheetOutdated ? t.oldSheet : fetched?.fetchedAt ? `${t.fetchedAt} ${formatDateTime(fetched.fetchedAt)}` : null;

  const pollButton = (kind: Kind, status: string | null | undefined, block: string) => (
    <Button
      size="sm"
      variant="ghost"
      leftIcon={<RefreshCw className="h-4 w-4" />}
      disabled={status !== "SENDING" && status !== "NO_RESPONSE"}
      loading={poll.isPending && poll.variables === kind}
      onClick={() => poll.mutate(kind)}
      aria-label={fill(t.pollNowAria, { block })}
    >
      {t.pollNow}
    </Button>
  );

  const block1 = hasList ? (
    <KvgsStatusBlock
      index={1}
      title={t.block1}
      status={listStatus}
      refId={list?.refId ?? null}
      receiptNo={list?.receiptNo ?? null}
      receiptDate={list?.receiptDate ?? null}
      note={block1Note}
      actions={
        <>
          {canEdit && listStatus === "ACCEPTED" && !reopen ? (
            <Button size="sm" variant="secondary" leftIcon={<PenLine className="h-4 w-4" />} onClick={() => setReopen(true)}>
              {t.editResend}
            </Button>
          ) : (
            canEdit && (
              <Button
                size="sm"
                leftIcon={<Send className="h-4 w-4" />}
                disabled={!contRow?.enabled || issues.length > 0 || locked || (listStatus === "ACCEPTED" && !dirty) || busy}
                loading={send.isPending && send.variables === "CONT_LIST"}
                onClick={() => setConfirm("CONT_LIST")}
              >
                {t.sendList}
              </Button>
            )
          )}
          {canEdit && pollButton("CONT_LIST", listStatus, t.block1)}
        </>
      }
    />
  ) : null;

  const block2 = (
    <KvgsStatusBlock
      index={hasList ? 2 : 1}
      title={t.block2}
      status={fetched?.status ?? null}
      refId={fetched?.refId ?? null}
      receiptNo={fetched?.receiptNo ?? null}
      receiptDate={fetched?.receiptDate ?? null}
      note={block2Note}
      actions={
        <>
          {canEdit && (
            <Button
              size="sm"
              leftIcon={<Send className="h-4 w-4" />}
              disabled={!kvgsRow?.enabled || fetched?.status === "SENDING" || busy}
              loading={send.isPending && send.variables === "KVGS"}
              onClick={() => setConfirm("KVGS")}
            >
              {t.fetch}
            </Button>
          )}
          {canEdit && pollButton("KVGS", fetched?.status, t.block2)}
          {kvgsSheet ? (
            <Button asChild size="sm" variant="secondary">
              <Link href={`/dossiers/${dossierId}/kvgs/${branch}/print?mau=${mau}`}>
                <Printer aria-hidden="true" className="h-4 w-4" />
                {t.print}
              </Link>
            </Button>
          ) : (
            <Button size="sm" variant="secondary" leftIcon={<Printer className="h-4 w-4" />} disabled title={t.printBlocked}>
              {t.print}
            </Button>
          )}
        </>
      }
    />
  );

  const errors = (kind: Kind) => {
    const list2 = kind === "CONT_LIST" ? list?.errors ?? [] : fetched?.errors ?? [];
    if (list2.length === 0) return null;
    return (
      <Alert tone="danger" title={fill(kind === "CONT_LIST" ? t.listErrorsTitle : t.kvgsErrorsTitle, { n: list2.length })}>
        <ul className="flex flex-col gap-1">
          {list2.map((e, i) => (
            <li key={`${e.code}-${e.line ?? 0}-${i}`}>
              {e.line ? <span className="font-medium">{fill(t.errorRow, { line: e.line })}: </span> : null}
              <span className="font-mono">{e.code}</span> {e.message}
              {e.solution && <span className="block text-fg-muted">{fill(t.solution, { text: e.solution })}</span>}
            </li>
          ))}
        </ul>
      </Alert>
    );
  };

  const header = view.header;
  const subtitle = [
    header.declarationNo ? fill(t.declNo, { no: header.declarationNo }) : null,
    header.typeCode,
    header.customsOffice,
    header.registeredOn ? fill(t.registeredOn, { date: formatDate(header.registeredOn) }) : null,
    list ? fill(t.attempt, { n: list.attempt }) : null,
  ].filter(Boolean).join(" · ");

  return (
    <Card id={kvgsAnchor(branch)} aria-labelledby={titleId} className="scroll-mt-4">
      <CardHeader className="flex flex-row flex-wrap items-start gap-3">
        <IconTile icon={<Truck />} tone="primary" size="md" />
        <div className="min-w-0 flex-1 basis-60">
          {title}
          <CardDescription className="tabular-nums">{subtitle}</CardDescription>
        </div>
        <Button size="sm" variant="ghost" leftIcon={<History className="h-4 w-4" />} onClick={() => setHistoryOpen(true)}>
          {t.history}
        </Button>
      </CardHeader>
      <CardContent>
        <Stack gap="md">
          {!canEdit && <Alert tone="info">{t.viewOnly}</Alert>}
          {hasList ? (
            <Grid cols={{ base: 1, md: 2 }} gap="md">
              {block1}
              {block2}
            </Grid>
          ) : (
            block2
          )}
          {errors("KVGS")}

          {hasList && (
            <section aria-label={t.tableCaption} className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="min-w-0 flex-1 text-sm font-semibold text-fg">{fill(t.tableTitle, { n: rows.length })}</h4>
                {editable && (
                  <>
                    <Button size="sm" variant="secondary" leftIcon={<RefreshCw className="h-4 w-4" />} loading={refill.isPending} disabled={busy} onClick={() => refill.mutate()}>
                      {t.refill}
                    </Button>
                    <Button size="sm" variant="secondary" leftIcon={<FileSpreadsheet className="h-4 w-4" />} onClick={() => setImportOpen(true)}>
                      {t.importExcel}
                    </Button>
                  </>
                )}
                <RowActions
                  rowLabel={t.tableCaption}
                  actions={[
                    { id: "export", label: t.exportExcel, icon: <Download />, quick: false, disabled: rows.length === 0, onSelect: () => exportXlsx.mutate(strip(rows)) },
                    ...(editable ? [{ id: "clear", label: t.clearAll, icon: <Trash2 />, tone: "danger" as const, disabled: rows.length === 0, onSelect: () => setRemoval({ kind: "all" }) }] : []),
                  ]}
                />
              </div>
              <ContainerTable rows={rows} editable={editable} issues={issues} errorLines={errorLines} onChange={change} onRemove={(row) => setRemoval({ kind: "row", row })} />
              {errors("CONT_LIST")}
              {editable && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="secondary" leftIcon={<Plus className="h-4 w-4" />} onClick={addRow}>
                    {t.addRow}
                  </Button>
                  {dirty && <span className="text-sm text-fg-muted">{t.unsaved}</span>}
                  <Button className="ml-auto" size="sm" disabled={!dirty || busy} loading={save.isPending} onClick={() => draft && save.mutate(draft)}>
                    {t.save}
                  </Button>
                </div>
              )}
            </section>
          )}
        </Stack>
      </CardContent>

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        tone="warning"
        icon={<Send className="h-4 w-4" />}
        title={confirm === "KVGS" ? t.confirmFetchTitle : t.confirmListTitle}
        description={header.declarationNo ? fill(t.declNo, { no: header.declarationNo }) : undefined}
        confirmLabel={t.confirmSend}
        loading={send.isPending}
        onConfirm={() => confirm && send.mutate(confirm)}
      >
        <span className="block">{fill(t.confirmCompany, { name: header.companyName })}</span>
        <span className="block">{fill(t.confirmOffice, { office: customsOfficeName || header.customsOffice || "" })}</span>
      </ConfirmDialog>

      <ConfirmDialog
        open={removal !== null}
        onOpenChange={(o) => !o && setRemoval(null)}
        icon={<Trash2 className="h-4 w-4" />}
        title={removal?.kind === "row" ? fill(t.removeTitle, { n: removal.row.n }) : t.clearTitle}
        confirmLabel={removal?.kind === "row" ? t.removeRow : t.clearAll}
        onConfirm={() => {
          if (removal?.kind === "row") edit(rows.filter((r) => r.key !== removal.row.key));
          else edit([]);
          setRemoval(null);
        }}
      >
        {removal?.kind === "row" ? t.removeBody : t.clearBody}
      </ConfirmDialog>

      <Dialog open={importOpen} onOpenChange={(o) => !importXlsx.isPending && setImportOpen(o)}>
        <DialogContent title={t.importTitle} icon={<FileSpreadsheet className="h-4 w-4" />} description={t.importDesc}>
          {importXlsx.isPending ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-fg-muted" role="status">
              <Spinner />
              {t.reading}
            </div>
          ) : (
            <FileDropzone
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              multiple={false}
              maxSize={10 * 1024 * 1024}
              labels={{ title: t.importDrop }}
              onFiles={(files) => files[0] && importXlsx.mutate(files[0])}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen} defaultPresentation="panel">
        <DialogContent title={t.historyTitle} icon={<History className="h-4 w-4" />} description={t.historyDesc}>
          <MessageList messages={(sheet?.messages ?? []).filter((m) => baseOp(m.operation) === "CONT_LIST" || baseOp(m.operation) === "KVGS")} />
        </DialogContent>
      </Dialog>
    </Card>
  );
}
