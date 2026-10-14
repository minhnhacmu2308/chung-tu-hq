"use client";
// Bước 5 – Review tờ khai: xem tờ khai nháp IDA/EDA theo nhóm, nguồn từng chỉ tiêu, thuế dự kiến → phê duyệt.
import {
  Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Checkbox, createDataTableColumnHelper, DataTable,
  Dialog, DialogContent, DialogFooter, EmptyState, Field, Grid, Input, Stack, Tabs, TabsContent, TabsList, TabsTrigger, toast, cn,
} from "@kb/ui";
import { canEditDeclaration, isDeclarationFieldEditable } from "@kb/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, FileCheck2, FileText, Paperclip, Pencil, Plus, RotateCcw, ShieldCheck } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { dossierKeys, listDocuments } from "@/api/dossiers";
import { approveDeclaration, declarationKeys, getDeclarationView, reopenDeclaration, updateDeclarationField, type DeclarationItemView } from "@/api/declaration";
import { getSession, sessionKeys } from "@/api/session";
import { getOrganization, settingsKeys } from "@/api/settings";
import { toastMutationError } from "@/lib/mutation-error";
import { formatBytesVi, formatDate, formatDateTime, formatMoney, formatNumber, formatVnd } from "@/lib/format";
import { DOC_KIND_LABELS, type Declaration, type DeclarationField } from "@/mocks/types";
import { errorMessage, KeyValue, SourceChip, StepError, StepLoading, StickyActionBar } from "./declaration-parts";
import type { StepProps } from "./types";

const SECTION_LABELS: Record<DeclarationField["section"], string> = {
  GENERAL: "Thông tin chung",
  PARTIES: "Người xuất khẩu / nhập khẩu",
  TRANSPORT: "Vận đơn & vận chuyển",
  VALUE: "Hóa đơn & trị giá",
};

const DATE_CODES = new Set(["NGAY_DK", "NGAY_DEN", "NGAY_HD"]);

function displayValue(f: DeclarationField, currency: string) {
  if (DATE_CODES.has(f.code) && /^\d{4}-\d{2}-\d{2}$/.test(f.value)) return formatDate(f.value);
  if (f.code === "TONG_TG") return formatMoney(f.value, currency);
  if (f.code === "TY_GIA") return `${formatNumber(f.value)} VND/${currency}`;
  if (f.code === "TRONG_LUONG") return `${formatNumber(f.value, 2)} kg`;
  return f.value;
}

function FieldTile({ field, currency, note, onEdit }: { field: DeclarationField; currency: string; note?: string | undefined; onEdit?: (() => void) | undefined }) {
  return (
    <div className={cn("flex flex-col gap-1.5 rounded-md border p-3", field.suspect ? "border-warning bg-warning-subtle" : "border-border bg-surface")}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-fg-muted">
          {field.label} <span className="font-mono text-fg-subtle">· {field.code}</span>
        </p>
        <SourceChip source={field.source} className="shrink-0" />
      </div>
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 break-words text-sm font-medium text-fg">{displayValue(field, currency) || <span className="font-normal text-fg-subtle">Chưa có giá trị</span>}</p>
        {onEdit && (
          <Button size="sm" variant="ghost" className="-my-1 shrink-0" leftIcon={<Pencil className="h-3.5 w-3.5" />} aria-label={`Sửa ${field.label}`} onClick={onEdit}>
            Sửa
          </Button>
        )}
      </div>
      {field.suspect && (
        <p className="flex items-start gap-1 text-sm text-warning-subtle-fg">
          <AlertTriangle aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>
            <span className="font-medium">Cần kiểm tra.</span> {note ?? "Dữ liệu chưa đối chiếu được giữa các chứng từ."}
          </span>
        </p>
      )}
    </div>
  );
}

const SUSPECT_NOTES: Record<string, string> = {
  CANG_DO: "B/L và Arrival Notice ghi cảng khác nhau – đã lấy điểm đến cuối tại Việt Nam.",
  TRONG_LUONG: "Packing List 5.420,00 kg – B/L 5.402,00 kg.",
  TY_GIA: "Tỷ giá theo ngày khai dự kiến, sẽ cập nhật khi đăng ký tờ khai.",
};

function GeneralTab({ decl, currency, onEdit }: { decl: Declaration; currency: string; onEdit?: ((f: DeclarationField) => void) | undefined }) {
  return (
    <Stack gap="lg">
      {(Object.keys(SECTION_LABELS) as DeclarationField["section"][]).map((section) => {
        const fields = decl.fields.filter((f) => f.section === section);
        if (!fields.length) return null;
        return (
          <section key={section} aria-labelledby={`sec-${section}`}>
            <h3 id={`sec-${section}`} className="mb-2 text-sm font-semibold text-fg">
              {SECTION_LABELS[section]}
            </h3>
            <Grid cols={{ base: 1, md: 2, xl: 3 }} gap="sm">
              {fields.map((f) => (
                <FieldTile key={f.code} field={f} currency={currency} note={f.note ?? SUSPECT_NOTES[f.code]} onEdit={onEdit && isDeclarationFieldEditable(f.code) ? () => onEdit(f) : undefined} />
              ))}
            </Grid>
          </section>
        );
      })}
    </Stack>
  );
}

const col = createDataTableColumnHelper<DeclarationItemView>();

function ItemsTab({ items, currency }: { items: DeclarationItemView[]; currency: string }) {
  const columns = col.columns([
    col.accessor("lineNo", { header: "#", size: 48, meta: { align: "center" } }),
    col.accessor("description", {
      header: "Mô tả hàng hóa",
      meta: { wrap: true },
      size: 260,
      cell: (c) => (
        <div>
          <p className="text-fg">{c.getValue()}</p>
          <p className="text-xs text-fg-subtle">Xuất xứ {c.row.original.origin}</p>
        </div>
      ),
    }),
    col.accessor("hsConfirmed", { header: "Mã HS", cell: (c) => <span className="font-mono">{c.getValue() ?? "—"}</span> }),
    col.accessor("quantity", {
      header: "Lượng",
      meta: { align: "end" },
      cell: (c) => `${formatNumber(c.getValue())} ${c.row.original.unit}`,
    }),
    col.accessor("unitPrice", { header: `Đơn giá (${currency})`, meta: { align: "end" }, cell: (c) => formatMoney(c.getValue(), undefined, 3) }),
    col.accessor("amount", { header: `Trị giá (${currency})`, meta: { align: "end" }, cell: (c) => formatMoney(c.getValue()) }),
    col.accessor("customsValueVnd", { header: "Trị giá tính thuế (VND)", meta: { align: "end" }, cell: (c) => formatMoney(c.getValue(), undefined, 0) }),
    col.accessor("importDutyVnd", {
      header: "Thuế NK",
      meta: { align: "end" },
      cell: (c) => (
        <div>
          <p className="tabular-nums">{formatMoney(c.getValue(), undefined, 0)}</p>
          <p className="text-xs text-fg-subtle">{c.row.original.importDutyRate ?? "—"}%</p>
        </div>
      ),
    }),
    col.accessor("vatVnd", {
      header: "VAT",
      meta: { align: "end" },
      cell: (c) => (
        <div>
          <p className="tabular-nums">{formatMoney(c.getValue(), undefined, 0)}</p>
          <p className="text-xs text-fg-subtle">{c.row.original.vatRate ?? "—"}%</p>
        </div>
      ),
    }),
  ]);
  return <DataTable aria-label="Danh sách hàng trên tờ khai" columns={columns} data={items} getRowId={(r) => r.id} />;
}

function TaxTab({ decl, items, currency }: { decl: Declaration; items: DeclarationItemView[]; currency: string }) {
  const invoice = decl.fields.find((f) => f.code === "TONG_TG")?.value ?? "0";
  const policies = Array.from(new Set(items.map((i) => i.policyNote).filter((p): p is string => Boolean(p))));
  const totalTax = String(Number(decl.estimatedImportDutyVnd) + Number(decl.estimatedVatVnd));
  return (
    <Grid cols={{ base: 1, lg: 2 }} gap="md">
      <Card>
        <CardHeader>
          <CardTitle as="h3">Trị giá tính thuế</CardTitle>
          <CardDescription>Theo điều kiện giá {decl.fields.find((f) => f.code === "DK_GIA")?.value}. Khoản cộng ghi rõ nguồn.</CardDescription>
        </CardHeader>
        <CardContent className="divide-y divide-border">
          <KeyValue label="Trị giá hóa đơn" hint={<SourceChip source="INVOICE" />} value={formatMoney(invoice, currency)} />
          {decl.valueAdjustments.length === 0 && <KeyValue label="Khoản điều chỉnh cộng" hint="Giá CIF/CIP – không cần cộng cước, bảo hiểm" value="0" />}
          {decl.valueAdjustments.map((a) => (
            <KeyValue
              key={a.label}
              label={
                <span className="inline-flex items-center gap-1">
                  <Plus aria-hidden="true" className="h-3.5 w-3.5 text-fg-subtle" />
                  {a.label}
                </span>
              }
              hint={<SourceChip source={a.source} />}
              value={formatMoney(a.amount, a.currency)}
            />
          ))}
          <KeyValue
            label="Tỷ giá tính thuế"
            hint={`Ngày ${formatDate(decl.exchangeRateDate)} · nguồn chính thức theo ngày, không dùng tỷ giá trên chứng từ forwarder`}
            value={`${formatNumber(decl.exchangeRate)} VND/${currency}`}
          />
          <KeyValue strong label="Trị giá tính thuế" value={formatVnd(decl.customsValueVnd)} />
        </CardContent>
      </Card>
      <Stack gap="md">
        <Card>
          <CardHeader>
            <CardTitle as="h3">Thuế dự kiến</CardTitle>
            <CardDescription>Số liệu tham khảo – thuế chính thức theo thông báo của Hải quan.</CardDescription>
          </CardHeader>
          <CardContent className="divide-y divide-border">
            <KeyValue label="Thuế nhập khẩu" value={formatVnd(decl.estimatedImportDutyVnd)} />
            <KeyValue label="Thuế GTGT (VAT)" value={formatVnd(decl.estimatedVatVnd)} />
            <KeyValue strong label="Tổng thuế phải nộp dự kiến" value={formatVnd(totalTax)} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle as="h3">Chính sách & ưu đãi</CardTitle>
          </CardHeader>
          <CardContent>
            {policies.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-fg-muted">
                <CheckCircle2 aria-hidden="true" className="h-4 w-4 text-success" />
                Không có chính sách quản lý chuyên ngành cho các mã HS này.
              </p>
            ) : (
              <Stack gap="sm">
                {policies.map((p) => (
                  <Alert key={p} tone={p.startsWith("Kiểm tra") ? "warning" : "info"}>
                    {p}
                  </Alert>
                ))}
              </Stack>
            )}
          </CardContent>
        </Card>
      </Stack>
    </Grid>
  );
}

function DocumentsTab({ dossierId }: { dossierId: string }) {
  const docs = useQuery({ queryKey: dossierKeys.documents(dossierId), queryFn: () => listDocuments(dossierId) });
  if (docs.isLoading) return <StepLoading />;
  if (docs.isError) return <StepError error={docs.error} onRetry={() => void docs.refetch()} />;
  if (!docs.data?.length) return <EmptyState icon={<Paperclip />} title="Chưa có chứng từ đính kèm" description="Chứng từ upload ở bước 2 sẽ được đính kèm khi gửi HYS." />;
  return (
    <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
      {docs.data.map((d) => (
        <li key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
          <FileText aria-hidden="true" className="h-5 w-5 text-fg-subtle" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-fg">{DOC_KIND_LABELS[d.kind]}</p>
            <p className="truncate text-xs text-fg-muted">
              {d.fileName} · {d.pages} trang · {formatBytesVi(d.sizeBytes)}
            </p>
          </div>
          <Badge tone="info">Đính kèm HYS</Badge>
        </li>
      ))}
    </ul>
  );
}

/** Sửa tay một chỉ tiêu trên tờ khai nháp. Giá trị mới mang nguồn "Người khai sửa" và được ghi vào lịch sử sửa. */
function EditFieldDialog({ dossierId, field, currency, onClose }: { dossierId: string; field: DeclarationField; currency: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [value, setValue] = useState(field.value);
  const isDate = DATE_CODES.has(field.code);
  const next = value.trim();
  const save = useMutation({
    mutationFn: () => updateDeclarationField(dossierId, field.code, next),
    onSuccess: () => {
      toast({ tone: "success", title: `Đã sửa ${field.label}` });
      void qc.invalidateQueries({ queryKey: declarationKeys.view(dossierId) });
      void qc.invalidateQueries({ queryKey: dossierKeys.all });
      onClose();
    },
    onError: toastMutationError("Không lưu được chỉ tiêu"),
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title="Sửa chỉ tiêu tờ khai" icon={<Pencil className="h-4 w-4" />} description={`${field.label} · ${field.no ?? field.code}`} size="sm">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (next !== field.value && !save.isPending) save.mutate();
          }}
        >
          <Stack gap="md">
            <div className="divide-y divide-border rounded-md border border-border px-3">
              <KeyValue label="Giá trị hiện tại" hint={<SourceChip source={field.source} />} value={displayValue(field, currency) || "—"} />
            </div>
            {field.suspect && field.note && <Alert tone="warning">{field.note}</Alert>}
            <Field label="Giá trị mới" hint="Sau khi lưu, chỉ tiêu mang nguồn “Người khai sửa” và được giữ khi dựng lại tờ khai.">
              <Input type={isDate ? "date" : "text"} value={value} maxLength={500} autoFocus onChange={(e) => setValue(e.currentTarget.value)} />
            </Field>
          </Stack>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Hủy
            </Button>
            <Button type="submit" loading={save.isPending} disabled={next === field.value}>
              Lưu
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const TABS = ["general", "items", "tax", "docs"] as const;
type Tab = (typeof TABS)[number];

export function ReviewStep({ dossier, goTo }: StepProps) {
  const qc = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tabParam = params.get("tab");
  const tab: Tab = (TABS as readonly string[]).includes(tabParam ?? "") ? (tabParam as Tab) : "general";
  const setTab = (t: string) => {
    const next = new URLSearchParams(params.toString());
    next.set("tab", t);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [checked, setChecked] = useState(false);
  const [editing, setEditing] = useState<DeclarationField | null>(null);
  const [reopenOpen, setReopenOpen] = useState(false);
  const session = useQuery({ queryKey: sessionKeys.me, queryFn: getSession });
  const canEdit = session.data ? canEditDeclaration(session.data.user.role) : false;
  const org = useQuery({ queryKey: settingsKeys.org, queryFn: getOrganization });
  // Nguyên tắc 4 mắt: người tạo hồ sơ không tự duyệt (Chủ sở hữu được miễn). Backend chặn lần nữa.
  const blockedByFourEyes = Boolean(org.data?.fourEyes && session.data && session.data.user.role !== "OWNER" && session.data.user.id === dossier.ownerId);
  const reopen = useMutation({
    mutationFn: () => reopenDeclaration(dossier.id),
    onSuccess: () => {
      setReopenOpen(false);
      toast({ tone: "success", title: "Đã mở lại tờ khai", description: "Sửa xong cần phê duyệt lại trước khi truyền Hải quan." });
      void qc.invalidateQueries({ queryKey: declarationKeys.view(dossier.id) });
      void qc.invalidateQueries({ queryKey: dossierKeys.all });
    },
    onError: toastMutationError("Không mở lại được tờ khai"),
  });
  const viewQ = useQuery({ queryKey: declarationKeys.view(dossier.id), queryFn: () => getDeclarationView(dossier.id) });
  const approve = useMutation({
    mutationFn: () => approveDeclaration(dossier.id),
    onSuccess: () => {
      setConfirmOpen(false);
      toast({ tone: "success", title: "Đã phê duyệt tờ khai", description: "Sẵn sàng ký số và truyền Hải quan." });
      void qc.invalidateQueries({ queryKey: declarationKeys.view(dossier.id) });
      void qc.invalidateQueries({ queryKey: dossierKeys.all });
      goTo("submit");
    },
    onError: (e) => toast({ tone: "danger", title: errorMessage(e) }),
  });

  if (viewQ.isLoading) return <StepLoading />;
  if (viewQ.isError) return <StepError error={viewQ.error} onRetry={() => void viewQ.refetch()} />;
  const { declaration: decl, items, unconfirmedHs } = viewQ.data!;

  if (!decl) {
    return (
      <Card>
        <CardContent className="pt-5">
          <EmptyState
            icon={<FileCheck2 />}
            title="Chưa có tờ khai nháp"
            description="Chạy AI Agent với lựa chọn “Tạo tờ khai” để dựng tờ khai từ dữ liệu đã xác nhận."
            action={<Button onClick={() => goTo("agent")}>Sang AI Agent</Button>}
          />
        </CardContent>
      </Card>
    );
  }

  const suspect = decl.fields.filter((f) => f.suspect);
  const totalTax = String(Number(decl.estimatedImportDutyVnd) + Number(decl.estimatedVatVnd));
  const isDraft = decl.status === "DRAFT";
  const kindLabel = decl.kind === "IDA" ? "Tờ khai nhập khẩu (IDA)" : "Tờ khai xuất khẩu (EDA)";

  return (
    <Stack gap="lg">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex flex-wrap items-center gap-2">
              {kindLabel}
              <span className="font-mono text-sm font-normal text-fg-muted">{dossier.typeCode}</span>
            </CardTitle>
            <CardDescription>
              {dossier.partner} · {formatMoney(decl.fields.find((f) => f.code === "TONG_TG")?.value ?? "0", dossier.currency)} · {items.length} dòng hàng
            </CardDescription>
          </div>
          {isDraft ? (
            <Badge tone="warning">Bản nháp, chờ duyệt</Badge>
          ) : decl.status === "APPROVED" ? (
            <Badge tone="success">Đã phê duyệt</Badge>
          ) : (
            <Badge tone="info">Đã truyền Hải quan</Badge>
          )}
        </CardHeader>
        <CardContent>
          <Stack gap="sm">
            {!isDraft && decl.approvedBy && (
              <Alert tone="success" title="Đã phê duyệt">
                {decl.approvedBy} phê duyệt lúc {decl.approvedAt ? formatDateTime(decl.approvedAt) : "—"}.
              </Alert>
            )}
            {isDraft && suspect.length > 0 && (
              <Alert tone="warning" title={`${suspect.length} chỉ tiêu cần kiểm tra`}>
                Được tô vàng trong tab Thông tin chung: {suspect.map((f) => f.label).join(", ")}.
              </Alert>
            )}
            {isDraft && blockedByFourEyes && (
              <Alert tone="info" title="Cần người khác phê duyệt">
                Doanh nghiệp bật nguyên tắc 4 mắt: bạn là người tạo hồ sơ này nên không tự phê duyệt được. Nhờ một Người duyệt khác hoặc Chủ sở hữu.
              </Alert>
            )}
            {unconfirmedHs > 0 && (
              <Alert
                tone="danger"
                title={`Còn ${unconfirmedHs} mã HS chưa xác nhận`}
                action={
                  <Button size="sm" variant="secondary" onClick={() => goTo("agent")}>
                    Xác nhận HS
                  </Button>
                }
              >
                Không thể phê duyệt khi còn mã HS chưa được người xác nhận.
              </Alert>
            )}
          </Stack>

          <Tabs value={tab} onValueChange={setTab} className="mt-4">
            <TabsList aria-label="Nhóm chỉ tiêu tờ khai">
              <TabsTrigger value="general">
                Thông tin chung {suspect.length > 0 && <Badge tone="warning">{suspect.length}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="items">
                Danh sách hàng <Badge tone="neutral">{items.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="tax">Thuế & chính sách</TabsTrigger>
              <TabsTrigger value="docs">Chứng từ đính kèm</TabsTrigger>
            </TabsList>
            <TabsContent value="general">
              <GeneralTab decl={decl} currency={dossier.currency} onEdit={isDraft && canEdit ? setEditing : undefined} />
            </TabsContent>
            <TabsContent value="items">
              <ItemsTab items={items} currency={dossier.currency} />
            </TabsContent>
            <TabsContent value="tax">
              <TaxTab decl={decl} items={items} currency={dossier.currency} />
            </TabsContent>
            <TabsContent value="docs">
              <DocumentsTab dossierId={dossier.id} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <StickyActionBar>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-fg-muted">Tổng thuế phải nộp dự kiến</p>
          <p className="text-lg font-semibold tabular-nums text-fg">{formatVnd(totalTax)}</p>
          {totalTax === "0" && <p className="hidden text-xs text-fg-subtle sm:block">Không phát sinh thuế (miễn thuế hoặc thuế suất 0%) – xem tab Thuế & chính sách</p>}
        </div>
        <Button variant="ghost" onClick={() => goTo("ocr")}>
          Quay lại OCR
        </Button>
        {isDraft ? (
          <Button
            leftIcon={<ShieldCheck className="h-4 w-4" />}
            disabled={unconfirmedHs > 0 || blockedByFourEyes}
            onClick={() => {
              setChecked(false);
              setConfirmOpen(true);
            }}
          >
            Phê duyệt tờ khai
          </Button>
        ) : (
          <>
            {decl.status === "APPROVED" && canEdit && (
              <Button variant="secondary" leftIcon={<RotateCcw className="h-4 w-4" />} onClick={() => setReopenOpen(true)}>
                Mở lại để sửa
              </Button>
            )}
            <Button onClick={() => goTo("submit")}>Sang khai báo Hải quan</Button>
          </>
        )}
      </StickyActionBar>

      {editing && <EditFieldDialog key={editing.code} dossierId={dossier.id} field={editing} currency={dossier.currency} onClose={() => setEditing(null)} />}

      <Dialog open={reopenOpen} onOpenChange={setReopenOpen}>
        <DialogContent title="Mở lại tờ khai để sửa" icon={<RotateCcw className="h-4 w-4" />} description={`${kindLabel} · ${dossier.code}`} size="sm">
          <p className="text-sm text-fg-muted">Tờ khai quay về bản nháp và phê duyệt hiện tại bị hủy. Sau khi sửa, người duyệt phải phê duyệt lại thì mới truyền Hải quan được.</p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReopenOpen(false)}>
              Hủy
            </Button>
            <Button loading={reopen.isPending} onClick={() => reopen.mutate()}>
              Mở lại tờ khai
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent title="Phê duyệt tờ khai" icon={<ShieldCheck className="h-4 w-4" />} description={`${kindLabel} · ${dossier.code}`} size="sm">
          <Stack gap="md">
            <div className="divide-y divide-border rounded-md border border-border px-3">
              <KeyValue label="Đối tác" value={dossier.partner} />
              <KeyValue label="Trị giá tính thuế" value={formatVnd(decl.customsValueVnd)} />
              <KeyValue strong label="Thuế dự kiến" value={formatVnd(totalTax)} />
            </div>
            {suspect.length > 0 && (
              <>
                <Alert tone="warning">
                  Còn {suspect.length} chỉ tiêu được đánh dấu nghi ngờ. Các chỉ tiêu này vẫn được ghi chú trên tờ khai.
                </Alert>
                <Checkbox label="Tôi đã kiểm tra các chỉ tiêu được đánh dấu" checked={checked} onChange={(e) => setChecked(e.currentTarget.checked)} />
              </>
            )}
            <p className="text-xs text-fg-subtle">Sau khi phê duyệt, tờ khai được khóa để ký số và truyền qua Customs Hub. Mọi chỉnh sửa sau đó cần phê duyệt lại.</p>
          </Stack>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Hủy
            </Button>
            <Button loading={approve.isPending} disabled={suspect.length > 0 && !checked} onClick={() => approve.mutate()}>
              Phê duyệt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Stack>
  );
}
