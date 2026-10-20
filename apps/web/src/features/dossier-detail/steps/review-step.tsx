"use client";
// Bước 5 – Review tờ khai: tờ khai dạng bản in VNACCS (sửa chỉ tiêu nháp bằng panel, gồm cả số Hải quan trả về), chứng từ đính kèm,
// theo dõi nghiệp vụ → phê duyệt. Cờ NEXT_PUBLIC_REVIEW_LEGACY_FORM=1 → form Phụ lục II cũ + tab "Hải quan trả về" (dự phòng khi thử nghiệm).
// Sau thông quan: tờ khai gốc chỉ đọc – sửa bằng bản khai bổ sung AMA ở bước 7 "Sửa sau thông quan".
import {
  Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Checkbox,
  Dialog, DialogContent, DialogFooter, EmptyState, SkeletonCard, Stack, Tabs, TabsContent, TabsList, TabsTrigger, toast,
} from "@kb/ui";
import { canEditDeclaration, declarationEditMode } from "@kb/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileCheck2, FileText, Paperclip, RotateCcw, ShieldCheck } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { dossierKeys, listDocuments } from "@/api/dossiers";
import { approveDeclaration, declarationKeys, getDeclarationView, reopenDeclaration } from "@/api/declaration";
import { getSession, sessionKeys } from "@/api/session";
import { customsKeys, getSubmission } from "@/api/customs";
import { getOrganization, settingsKeys } from "@/api/settings";
import { toastMutationError } from "@/lib/mutation-error";
import { legacyReviewForm } from "@/lib/feature-flags";
import { formatBytesVi, formatDateTime, formatMoney, formatNumber, formatVnd } from "@/lib/format";
import { DOC_KIND_LABELS, type Declaration } from "@/mocks/types";
import { errorMessage, KeyValue, StepError, StepLoading, StickyActionBar } from "./declaration-parts";
import { CustomsInfoPanel } from "./customs-info-panel";
import { errorPlace, fieldErrors } from "./customs-errors";
import { fieldTitle } from "./declaration-groups";
import type { StepProps } from "./types";
import { DossierDeclarationForm } from "../../declaration-form/dossier-declaration-form";
import { DossierCustomsTab, DossierOperationsTab } from "../../declaration-form/dossier-tabs";
import { PrintDeclaration } from "../../declaration-print/print-declaration";
import { LoadError } from "@/components/common/load-error";

const exportTaxText = (status: Declaration["status"]) =>
  status === "SUBMITTED" ? "Xem số thuế Hải quan trả về ở bước Khai báo Hải quan" : "Hải quan tính sau khi khai tạm EDA";

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

const LEGACY_TABS = ["full", "docs", "customs", "ops"] as const;
type Tab = (typeof LEGACY_TABS)[number];
// Bản in gộp tab "Hải quan trả về" vào tab "Tờ khai": ?tab=customs cũ → "full".
const PRINT_TABS: readonly Tab[] = ["full", "docs", "ops"];

export function ReviewStep({ dossier, goTo }: StepProps) {
  const qc = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tabParam = params.get("tab");
  const setTab = (t: string) => {
    const next = new URLSearchParams(params.toString());
    next.set("tab", t);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [checked, setChecked] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const legacy = legacyReviewForm();
  /** Số ô cần xử lý (lỗi + còn thiếu) của bản in – huy hiệu tab "Tờ khai". */
  const [attention, setAttention] = useState(0);
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
  const subQ = useQuery({ queryKey: customsKeys.submission(dossier.id), queryFn: () => getSubmission(dossier.id) });
  const customsInfo = subQ.data?.customsInfo ?? null;
  // Đang sửa sau thông quan (bản khai bổ sung AMA ở bước 7): tờ khai gốc giữ nguyên, khóa như đã thông quan.
  const stage = subQ.data?.stage;
  const postEditing = Boolean(stage?.startsWith("POST_"));
  const tabs: readonly Tab[] = legacy ? LEGACY_TABS : PRINT_TABS;
  const tab: Tab = (tabs as readonly string[]).includes(tabParam ?? "") ? (tabParam as Tab) : "full";
  const rejection = subQ.data?.rejection ?? null;
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
  const errs = fieldErrors(decl.kind, rejection);
  const totalTax = String(Number(decl.estimatedImportDutyVnd) + Number(decl.estimatedVatVnd));
  const isDraft = decl.status === "DRAFT";
  // Giai đoạn truyền chưa tải xong → chỉ đọc (tránh mở ô rồi khóa lại); không đọc được → coi như chưa khai, backend vẫn chặn theo giai đoạn thật.
  const editMode = subQ.isPending ? "LOCKED" : declarationEditMode(decl.status, subQ.data?.stage ?? "NOT_SENT");
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
            {/* Bản in: lỗi Hải quan hiện trên ô + "Chỉ ô cần xử lý" ở thanh công cụ – không cần khung tổng hợp. */}
            {legacy && rejection && errs.length > 0 && (
              <Alert tone="danger" title={`Hải quan từ chối ${rejection.operation} lúc ${formatDateTime(rejection.at)} – ${errs.length} lỗi`}>
                <p>{isDraft ? "Sửa các chỉ tiêu báo lỗi dưới đây ở tab Tờ khai đầy đủ (lỗi theo dòng hàng: sửa ở bước OCR/AI Agent), phê duyệt lại rồi khai lại." : "Mở lại tờ khai để sửa các chỉ tiêu báo lỗi dưới đây, phê duyệt lại rồi khai lại."}</p>
                <ul className="mt-1 flex flex-col gap-1">
                  {errs.map((e, i) => (
                    <li key={i}>
                      <span className="font-medium">{errorPlace(e)}:</span> {e.message}
                      {e.solution ? ` → ${e.solution}` : ""}
                    </li>
                  ))}
                </ul>
              </Alert>
            )}
            {!isDraft && decl.approvedBy && (
              <Alert tone="success" title="Đã phê duyệt">
                {decl.approvedBy} phê duyệt lúc {decl.approvedAt ? formatDateTime(decl.approvedAt) : "—"}.
              </Alert>
            )}
            {isDraft && suspect.length > 0 && (
              <Alert tone="warning" title={`${suspect.length} chỉ tiêu cần kiểm tra`}>
                Kiểm tra ở tab {legacy ? "Tờ khai đầy đủ" : "Tờ khai"}: {suspect.map((f) => fieldTitle(f)).join(", ")}.
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
              {legacy ? (
                <TabsTrigger value="full">
                  Tờ khai đầy đủ {errs.length > 0 && <Badge tone="danger">{errs.length} lỗi</Badge>}
                </TabsTrigger>
              ) : (
                <TabsTrigger value="full">
                  Tờ khai{" "}
                  {attention > 0 && (
                    <Badge tone={errs.length > 0 ? "danger" : "warning"}>
                      {formatNumber(attention)}
                      <span className="sr-only"> ô cần xử lý</span>
                    </Badge>
                  )}
                </TabsTrigger>
              )}
              <TabsTrigger value="docs">Chứng từ đính kèm</TabsTrigger>
              {legacy && (
                <TabsTrigger value="customs">
                  Hải quan trả về {customsInfo ? customsInfo.directives.length > 0 && <Badge tone="warning">{customsInfo.directives.length}</Badge> : <Badge tone="neutral">chưa có</Badge>}
                </TabsTrigger>
              )}
              <TabsTrigger value="ops">Theo dõi & nghiệp vụ</TabsTrigger>
            </TabsList>
            {/* Bản in luôn gắn (ẩn bằng hidden khi ở tab khác): huy hiệu số ô cần xử lý đúng ngay cả khi mở thẳng tab khác, panel giữ phần đang sửa. */}
            <TabsContent value="full" {...(legacy ? {} : { forceMount: true as const, hidden: tab !== "full" })}>
              {legacy ? (
                <DossierDeclarationForm dossierId={dossier.id} decl={decl} items={items} mode={editMode} canEdit={canEdit} cleared={stage === "CLEARED" || postEditing} />
              ) : (
                <PrintDeclaration dossierId={dossier.id} decl={decl} items={items} mode={editMode} canEdit={canEdit} submission={subQ.data} onAttentionChange={setAttention} />
              )}
            </TabsContent>
            <TabsContent value="docs">
              <DocumentsTab dossierId={dossier.id} />
            </TabsContent>
            {legacy && (
              <TabsContent value="customs">
                {subQ.isLoading ? <SkeletonCard /> : subQ.isError ? <LoadError onRetry={() => void subQ.refetch()} /> : (
                  <Stack gap="lg">
                    {/* Tóm tắt + so với số ứng dụng ước tính, rồi đủ chỉ tiêu Hải quan trả về theo Phụ lục II. */}
                    {customsInfo && (
                      <CustomsInfoPanel
                        kind={decl.kind}
                        info={customsInfo}
                        estimate={{ customsValueVnd: decl.customsValueVnd, exchangeRate: decl.exchangeRate, ...(decl.kind === "IDA" ? { taxVnd: totalTax } : {}) }}
                      />
                    )}
                    <DossierCustomsTab kind={decl.kind} submission={subQ.data} items={items} />
                  </Stack>
                )}
              </TabsContent>
            )}
            <TabsContent value="ops">
              {subQ.isLoading ? <SkeletonCard /> : subQ.isError ? <LoadError onRetry={() => void subQ.refetch()} /> : (
                <DossierOperationsTab kind={decl.kind} submission={subQ.data} onGoSubmit={isDraft ? undefined : () => goTo("submit")} />
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <StickyActionBar>
        {decl.kind === "IDA" ? (
          <div className="min-w-0 flex-1">
            <p className="text-xs text-fg-muted">Tổng thuế phải nộp dự kiến (ước tính)</p>
            <p className="text-lg font-semibold tabular-nums text-fg">{formatVnd(totalTax)}</p>
            {totalTax === "0" && <p className="hidden text-xs text-fg-subtle cq-sm:block">Không phát sinh thuế (miễn thuế hoặc thuế suất 0%)</p>}
          </div>
        ) : (
          <div className="min-w-0 flex-1">
            <p className="text-xs text-fg-muted">Thuế xuất khẩu</p>
            <p className="text-sm font-medium text-fg">{exportTaxText(decl.status)}</p>
          </div>
        )}
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
              <KeyValue label="Trị giá tính thuế (ước tính)" value={formatVnd(decl.customsValueVnd)} />
              {decl.kind === "IDA" && <KeyValue strong label="Thuế dự kiến (ước tính)" value={formatVnd(totalTax)} />}
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
