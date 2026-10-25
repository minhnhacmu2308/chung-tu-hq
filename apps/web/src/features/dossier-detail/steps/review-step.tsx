"use client";
// Bước 5 – Review tờ khai: tờ khai dạng bản in VNACCS (sửa chỉ tiêu nháp bằng panel, gồm cả số Hải quan trả về), chứng từ đính kèm,
// theo dõi nghiệp vụ → phê duyệt. Cờ NEXT_PUBLIC_REVIEW_LEGACY_FORM=1 → form Phụ lục II cũ + tab "Hải quan trả về" (dự phòng khi thử nghiệm).
// Sau thông quan: tờ khai gốc chỉ đọc – sửa bằng bản khai bổ sung AMA ở bước 7 "Sửa sau thông quan".
import {
  Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Checkbox,
  Dialog, DialogContent, DialogFooter, EmptyState, fill, SkeletonCard, Stack, Tabs, TabsContent, TabsList, TabsTrigger, toast, useMessages, useUiLocale,
} from "@kb/ui";
import { branchCount, canEditDeclaration, type DeclarationBranch, type DeclarationEditMode, type LineItem, type SubmissionView } from "@kb/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileCheck2, FileText, Paperclip, RotateCcw, ShieldCheck } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { dossierKeys, listDocuments } from "@/api/dossiers";
import { approveDeclaration, declarationKeys, getDeclarationView, reopenDeclaration } from "@/api/declaration";
import { getSession, sessionKeys } from "@/api/session";
import { customsKeys, getSubmission, recallAllSheets } from "@/api/customs";
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
import { REVIEW_MESSAGES } from "./review-step.messages";
import { anyInProgress, encodeRecalled, parseRecalled, recalledCount } from "./branch-sheets";
import { editScopeOf, sentChangeWarnings } from "./edit-scope";
import { DossierDeclarationForm } from "../../declaration-form/dossier-declaration-form";
import { DossierCustomsTab, DossierOperationsTab } from "../../declaration-form/dossier-tabs";
import { PrintDeclaration } from "../../declaration-print/print-declaration";
import type { LeaveGuard } from "../../declaration-print/field-edit-panel";
import { cellDomId } from "../../declaration-print/print-cell";
import { declarationGapsOf, sheetIssueCounts, sheetTarget } from "../../declaration-print/print-state";
import { RequiredGapsAlert } from "../../declaration-print/required-gaps-alert";
import { LoadError } from "@/components/common/load-error";

const exportTaxText = (status: Declaration["status"], t: Record<"exportTaxSubmitted" | "exportTaxPending", string>) =>
  status === "SUBMITTED" ? t.exportTaxSubmitted : t.exportTaxPending;

function DocumentsTab({ dossierId }: { dossierId: string }) {
  const t = useMessages(REVIEW_MESSAGES);
  const kinds = useMessages(DOC_KIND_LABELS);
  const docs = useQuery({ queryKey: dossierKeys.documents(dossierId), queryFn: () => listDocuments(dossierId) });
  if (docs.isLoading) return <StepLoading />;
  if (docs.isError) return <StepError error={docs.error} onRetry={() => void docs.refetch()} />;
  if (!docs.data?.length) return <EmptyState icon={<Paperclip />} title={t.noDocsTitle} description={t.noDocsDesc} />;
  return (
    <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
      {docs.data.map((d) => (
        <li key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
          <FileText aria-hidden="true" className="h-5 w-5 text-fg-subtle" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-fg">{kinds[d.kind]}</p>
            <p className="truncate text-xs text-fg-muted">
              {d.fileName} · {fill(t.pages, { n: d.pages })} · {formatBytesVi(d.sizeBytes)}
            </p>
          </div>
          <Badge tone="info">{t.attachHys}</Badge>
        </li>
      ))}
    </ul>
  );
}

/**
 * Huy hiệu tab "Tờ khai": số ô cần xử lý + lỗi Hải quan không gắn được vào ô – cùng hàm với thanh công cụ của bản in (tab không cần gắn bản in).
 * Lô nhiều tờ: cộng mọi tờ (lỗi Hải quan của từng nhánh), chỉ tiêu chung còn thiếu đếm một lần.
 */
function AttentionBadge({ decl, items, branches, submission, mode, lineModes, canEdit, hasErrors }: {
  decl: Declaration; items: LineItem[]; branches: DeclarationBranch[]; submission: SubmissionView | undefined; mode: DeclarationEditMode; lineModes: Record<number, DeclarationEditMode>; canEdit: boolean; hasErrors: boolean;
}) {
  const t = useMessages(REVIEW_MESSAGES);
  const n = useMemo(() => sheetIssueCounts(decl, items, branches, submission, mode, canEdit, lineModes).total, [decl, items, branches, submission, mode, lineModes, canEdit]);
  if (n === 0) return null;
  return (
    <Badge tone={hasErrors ? "danger" : "warning"}>
      {formatNumber(n)}
      <span className="sr-only">{t.cellsToFix}</span>
    </Badge>
  );
}

const LEGACY_TABS = ["full", "docs", "customs", "ops"] as const;
type Tab = (typeof LEGACY_TABS)[number];
// Bản in gộp tab "Hải quan trả về" vào tab "Tờ khai": ?tab=customs cũ → "full".
const PRINT_TABS: readonly Tab[] = ["full", "docs", "ops"];

export function ReviewStep({ dossier, goTo }: StepProps) {
  const t = useMessages(REVIEW_MESSAGES);
  const locale = useUiLocale();
  const qc = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tabParam = params.get("tab");
  // Vừa gọi về từ bước Khai báo (?recalled=): nhắc phạm vi sửa.
  const recalled = parseRecalled(params.get("recalled"));
  // Rời tab bản in khi panel còn thay đổi chưa lưu → panel hỏi Lưu / Bỏ / Ở lại, tự chuyển tab khi Lưu hoặc Bỏ.
  const leaveGuard: LeaveGuard = useRef(null);
  /** Rời bản in (sang bước khác, mở hộp phê duyệt): còn thay đổi chưa lưu → panel hỏi trước; Lưu / Bỏ thì đi tới `href`. */
  const leave = (href: string, go: () => void) => {
    if (leaveGuard.current?.(href)) return;
    go();
  };
  const goStep = (step: Parameters<typeof goTo>[0]) => leave(`${pathname}?step=${step}`, () => goTo(step));
  const setTab = (t: string) => {
    const next = new URLSearchParams(params.toString());
    next.set("tab", t);
    const href = `${pathname}?${next.toString()}`;
    if (t !== "full" && leaveGuard.current?.(href)) return;
    router.replace(href, { scroll: false });
  };
  // Đổi tờ khai nhánh trên bản in (?sheet=k): panel còn thay đổi chưa lưu → hỏi trước như rời tab.
  const sheetHref = (no: number, tabTo?: string) => {
    const next = new URLSearchParams(params.toString());
    if (tabTo) next.set("tab", tabTo);
    next.set("sheet", String(no));
    return `${pathname}?${next.toString()}`;
  };
  const setSheet = (no: number) => {
    const href = sheetHref(no);
    if (leaveGuard.current?.(href)) return;
    router.replace(href, { scroll: false });
  };

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [checked, setChecked] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [recallOpen, setRecallOpen] = useState(false);
  const legacy = legacyReviewForm();
  const session = useQuery({ queryKey: sessionKeys.me, queryFn: getSession });
  const canEdit = session.data ? canEditDeclaration(session.data.user.role) : false;
  const org = useQuery({ queryKey: settingsKeys.org, queryFn: getOrganization });
  // Nguyên tắc 4 mắt: người tạo hồ sơ không tự duyệt (Chủ sở hữu được miễn). Backend chặn lần nữa.
  const blockedByFourEyes = Boolean(org.data?.fourEyes && session.data && session.data.user.role !== "OWNER" && session.data.user.id === dossier.ownerId);
  const reopen = useMutation({
    mutationFn: () => reopenDeclaration(dossier.id),
    onSuccess: () => {
      setReopenOpen(false);
      toast({ tone: "success", title: t.reopenedTitle, description: t.reopenedDesc });
      void qc.invalidateQueries({ queryKey: declarationKeys.view(dossier.id) });
      void qc.invalidateQueries({ queryKey: dossierKeys.all });
    },
    onError: toastMutationError(t.reopenFailed),
  });
  const viewQ = useQuery({ queryKey: declarationKeys.view(dossier.id), queryFn: () => getDeclarationView(dossier.id) });
  const subQ = useQuery({
    queryKey: customsKeys.submission(dossier.id),
    queryFn: () => getSubmission(dossier.id),
    // Như bước Khai báo: còn tờ đang chờ phản hồi (vd gọi về các tờ còn lại đang chạy) → hỏi lại mỗi giây, phạm vi sửa tự cập nhật khi chuỗi xong.
    refetchInterval: (q) => (q.state.data && anyInProgress(q.state.data) ? 1000 : false),
  });
  // Lô > 50 dòng: tờ khai nhánh đang xem trên bản in (?sheet=k), kẹp về 1..N như bản in; tham số ngoài khoảng → sửa lại URL.
  const sheetParam = params.get("sheet");
  const sheetCount = viewQ.data ? branchCount(viewQ.data.items.length) : null;
  const sheet = Math.min(sheetCount ?? Infinity, Math.max(1, Math.trunc(Number(sheetParam)) || 1));
  useEffect(() => {
    if (sheetCount === null || sheetParam === null || sheetParam === String(sheet)) return;
    const next = new URLSearchParams(params.toString());
    if (sheetCount > 1) next.set("sheet", String(sheet));
    else next.delete("sheet");
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }, [sheetCount, sheetParam, sheet, params, pathname, router]);
  const customsInfo = subQ.data?.customsInfo ?? null;
  // Đang sửa sau thông quan (bản khai bổ sung AMA ở bước 7): tờ khai gốc giữ nguyên, khóa như đã thông quan.
  const stage = subQ.data?.stage;
  const postEditing = Boolean(stage?.startsWith("POST_"));
  const tabs: readonly Tab[] = legacy ? LEGACY_TABS : PRINT_TABS;
  const tab: Tab = (tabs as readonly string[]).includes(tabParam ?? "") ? (tabParam as Tab) : "full";
  const rejection = subQ.data?.rejection ?? null;
  // "Đến ô cần xử lý": mở tab bản in rồi bấm vào ô (mở panel sửa ô) sau khi tab đã vẽ; n để bấm lại cùng ô.
  const [jump, setJump] = useState<{ id: string; n: number; sheet?: number } | null>(null);
  useEffect(() => {
    if (!jump || tab !== "full" || (jump.sheet !== undefined && jump.sheet !== sheet)) return;
    const frame = requestAnimationFrame(() => {
      const cell = document.querySelector<HTMLElement>(`[data-print-cell="${jump.id}"]`);
      cell?.scrollIntoView({ block: "center" });
      cell?.click();
    });
    return () => cancelAnimationFrame(frame);
  }, [jump, tab, sheet]);
  const recallRest = useMutation({
    mutationFn: () => recallAllSheets(dossier.id),
    onSuccess: (r) => {
      setRecallOpen(false);
      toast({ tone: r.sent ? "info" : "success", title: r.message });
      // Thông báo ?recalled= theo phạm vi mới (gọi về tất cả: tờ đã gọi về + tờ vừa gọi), không giữ "chỉ tờ k" cũ.
      const before = subQ.data ? recalledCount(subQ.data) : 0;
      const next = new URLSearchParams(params.toString());
      next.set("recalled", encodeRecalled({ scope: "all", count: before + r.sheets.length }));
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
      void qc.invalidateQueries({ queryKey: customsKeys.submission(dossier.id) });
      void qc.invalidateQueries({ queryKey: declarationKeys.view(dossier.id) });
      void qc.invalidateQueries({ queryKey: dossierKeys.all });
    },
    onError: (e) => {
      // Bị chặn (vd đang chờ phản hồi) → tải lại trạng thái truyền để nút / phạm vi đúng với máy chủ.
      void qc.invalidateQueries({ queryKey: customsKeys.submission(dossier.id) });
      toastMutationError(t.recallRemainingFailed)(e);
    },
  });
  const approve = useMutation({
    mutationFn: () => approveDeclaration(dossier.id),
    onSuccess: () => {
      setConfirmOpen(false);
      toast({ tone: "success", title: t.approvedToastTitle, description: t.approvedToastDesc });
      void qc.invalidateQueries({ queryKey: declarationKeys.view(dossier.id) });
      void qc.invalidateQueries({ queryKey: dossierKeys.all });
      goTo("submit");
    },
    onError: (e) => toast({ tone: "danger", title: errorMessage(e, locale) }),
  });

  if (viewQ.isLoading) return <StepLoading />;
  if (viewQ.isError) return <StepError error={viewQ.error} onRetry={() => void viewQ.refetch()} />;
  const { declaration: decl, items, branches, unconfirmedHs } = viewQ.data!;

  if (!decl) {
    return (
      <Card>
        <CardContent className="pt-5">
          <EmptyState
            icon={<FileCheck2 />}
            title={t.noDraftTitle}
            description={t.noDraftDesc}
            action={<Button onClick={() => goTo("agent")}>{t.toAgent}</Button>}
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
  // Lô nhiều tờ chỉ gọi về một số tờ: chỉ tiêu chung khóa, dòng chỉ sửa được ở tờ đã gọi về (scope); lô một tờ: như giai đoạn tờ khai.
  const scope = editScopeOf(decl.status, subQ.data, subQ.isPending);
  const editMode = scope.common;
  const lockedSheets = scope.lockedSheets.join(", ");
  // Đang gọi về (hoặc tờ nào còn chờ phản hồi) → khóa nút gọi về các tờ còn lại, tránh bấm trùng.
  const recallBusy = recallRest.isPending || Boolean(subQ.data && anyInProgress(subQ.data));
  // Số tờ trong thông báo "đã gọi về": theo tờ thực sự đã gọi về (chuỗi có thể dừng sớm), URL chỉ là số đã yêu cầu.
  const recalledN = subQ.data ? recalledCount(subQ.data) : 0;
  const sentWarn = isDraft && subQ.data ? sentChangeWarnings(subQ.data) : { totalValue: false, otherCommon: [] as string[] };
  const kindLabel = decl.kind === "IDA" ? t.kindImport : t.kindExport;
  // Ô bắt buộc còn trống → khóa Phê duyệt (backend chặn lần nữa khi duyệt và khi khai).
  const required = isDraft ? declarationGapsOf(decl, items, subQ.data) : { gaps: [], lineNos: [] };
  const goToGap = () => {
    const g = required.gaps[0];
    if (!g) return;
    // Ô của dòng hàng: mở đúng tờ chứa dòng (chỉ số dòng trong tờ); ô tờ khai: ở tờ đang xem.
    const at = g.line === undefined ? undefined : sheetTarget(required.lineNos, g.line);
    if (at && at.no !== sheet) {
      const href = sheetHref(at.no, "full");
      if (tab === "full" && leaveGuard.current?.(href)) return;
      router.replace(href, { scroll: false });
    } else if (tab !== "full") setTab("full");
    setJump((j) => ({ id: cellDomId(g.key, at?.line), n: (j?.n ?? 0) + 1, ...(at ? { sheet: at.no } : {}) }));
  };

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
              {dossier.partner} · {formatMoney(decl.fields.find((f) => f.code === "TONG_TG")?.value ?? "0", dossier.currency)} · {fill(t.lines, { n: items.length })}
            </CardDescription>
          </div>
          {isDraft ? (
            <Badge tone="warning">{t.draftBadge}</Badge>
          ) : decl.status === "APPROVED" ? (
            <Badge tone="success">{t.approvedBadge}</Badge>
          ) : (
            <Badge tone="info">{t.submittedBadge}</Badge>
          )}
        </CardHeader>
        <CardContent>
          <Stack gap="sm">
            {recalled && isDraft && (recalled.scope === "all" || scope.lockedSheets.length > 0) && (
              <Alert tone="info">
                {recalled.scope === "all" ? fill(t.recalledAllNotice, { n: recalledN || recalled.count }) : fill(t.recalledSheetsNotice, { list: recalled.sheets.join(", ") })}
              </Alert>
            )}
            {isDraft && scope.lockedSheets.length > 0 && (
              <Alert
                tone="warning"
                title={fill(t.commonLockedTitle, { sheets: lockedSheets })}
                action={
                  canEdit ? (
                    <Button size="sm" variant="secondary" disabled={recallBusy} leftIcon={<RotateCcw className="h-4 w-4" />} onClick={() => setRecallOpen(true)}>
                      {t.recallRemaining}
                    </Button>
                  ) : undefined
                }
              >
                {t.commonLockedBody}
              </Alert>
            )}
            {sentWarn.totalValue && <Alert tone="warning">{t.tkTpChanged}</Alert>}
            {sentWarn.otherCommon.length > 0 && <Alert tone="warning">{fill(t.commonChanged, { codes: sentWarn.otherCommon.join(", ") })}</Alert>}
            {/* Bản in: lỗi Hải quan hiện trên ô + "Chỉ ô cần xử lý" ở thanh công cụ – không cần khung tổng hợp. */}
            {legacy && rejection && errs.length > 0 && (
              <Alert tone="danger" title={fill(t.rejectedTitle, { op: rejection.operation, at: formatDateTime(rejection.at), n: errs.length })}>
                <p>{isDraft ? t.rejectedDraft : t.rejectedLocked}</p>
                <ul className="mt-1 flex flex-col gap-1">
                  {errs.map((e, i) => (
                    <li key={i}>
                      <span className="font-medium">{errorPlace(e, locale)}:</span> {e.message}
                      {e.solution ? ` → ${e.solution}` : ""}
                    </li>
                  ))}
                </ul>
              </Alert>
            )}
            {!isDraft && decl.approvedBy && (
              <Alert tone="success" title={t.approvedTitle}>
                {fill(t.approvedBy, { who: decl.approvedBy, at: decl.approvedAt ? formatDateTime(decl.approvedAt) : "—" })}
              </Alert>
            )}
            {isDraft && suspect.length > 0 && (
              <Alert tone="warning" title={fill(t.suspectTitle, { n: suspect.length })}>
                {fill(t.suspectBody, { tab: legacy ? t.tabFullLegacy : t.tabFull, fields: suspect.map((f) => fieldTitle(f)).join(", ") })}
              </Alert>
            )}
            {isDraft && blockedByFourEyes && (
              <Alert tone="info" title={t.fourEyesTitle}>
                {t.fourEyesBody}
              </Alert>
            )}
            {!legacy && (
              <RequiredGapsAlert gaps={required.gaps} lineNos={required.lineNos} actionLabel={t.goToGap} onAction={goToGap}>
                {t.gapsBody}
              </RequiredGapsAlert>
            )}
            {unconfirmedHs > 0 && (
              <Alert
                tone="danger"
                title={fill(t.hsTitle, { n: unconfirmedHs })}
                action={
                  <Button size="sm" variant="secondary" onClick={() => goStep("agent")}>
                    {t.confirmHs}
                  </Button>
                }
              >
                {t.hsBody}
              </Alert>
            )}
          </Stack>

          <Tabs value={tab} onValueChange={setTab} className="mt-4">
            <TabsList aria-label={t.tabsAria}>
              {legacy ? (
                <TabsTrigger value="full">
                  {t.tabFullLegacy} {errs.length > 0 && <Badge tone="danger">{fill(t.errorsBadge, { n: errs.length })}</Badge>}
                </TabsTrigger>
              ) : (
                <TabsTrigger value="full">
                  {t.tabFull} {subQ.isSuccess && <AttentionBadge decl={decl} items={items} branches={branches} submission={subQ.data} mode={editMode} lineModes={scope.lines} canEdit={canEdit} hasErrors={errs.length > 0} />}
                </TabsTrigger>
              )}
              <TabsTrigger value="docs">{t.tabDocs}</TabsTrigger>
              {legacy && (
                <TabsTrigger value="customs">
                  {t.tabCustoms} {customsInfo ? customsInfo.directives.length > 0 && <Badge tone="warning">{customsInfo.directives.length}</Badge> : <Badge tone="neutral">{t.notYet}</Badge>}
                </TabsTrigger>
              )}
              <TabsTrigger value="ops">{t.tabOps}</TabsTrigger>
            </TabsList>
            <TabsContent value="full">
              {legacy ? (
                <DossierDeclarationForm dossierId={dossier.id} decl={decl} items={items} mode={editMode} scope={scope} canEdit={canEdit} cleared={stage === "CLEARED" || postEditing} />
              ) : (
                // Chưa có giai đoạn Hải quan thì chưa vẽ: tránh hiện "BẢN NHÁP" / watermark cho tờ khai đã khai.
                subQ.isPending ? <SkeletonCard /> : subQ.isError ? <LoadError onRetry={() => void subQ.refetch()} /> : (
                  <PrintDeclaration dossierId={dossier.id} decl={decl} items={items} mode={editMode} scope={scope} canEdit={canEdit} submission={subQ.data} branches={branches} sheet={sheet} onSheetChange={setSheet} leaveGuard={leaveGuard} />
                )
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
          <div className="min-w-0 flex-1 basis-48">
            <p className="text-xs text-fg-muted">{t.totalTaxLabel}</p>
            <p className="text-lg font-semibold tabular-nums text-fg">{formatVnd(totalTax)}</p>
            {totalTax === "0" && <p className="hidden text-xs text-fg-subtle cq-sm:block">{t.noTax}</p>}
          </div>
        ) : (
          <div className="min-w-0 flex-1 basis-48">
            <p className="text-xs text-fg-muted">{t.exportTax}</p>
            <p className="text-sm font-medium text-fg">{exportTaxText(decl.status, t)}</p>
          </div>
        )}
        <Button variant="ghost" onClick={() => goStep("ocr")}>
          {t.backToOcr}
        </Button>
        {isDraft ? (
          <Button
            leftIcon={<ShieldCheck className="h-4 w-4" />}
            disabled={unconfirmedHs > 0 || blockedByFourEyes || required.gaps.length > 0}
            onClick={() =>
              // Còn thay đổi chưa lưu ở panel → hỏi trước (Lưu / Bỏ giữ nguyên trang), rồi bấm Phê duyệt lại.
              leave(`${pathname}?${params.toString()}`, () => {
                setChecked(false);
                setConfirmOpen(true);
              })
            }
          >
            {t.approveDecl}
          </Button>
        ) : (
          <>
            {decl.status === "APPROVED" && canEdit && (
              <Button variant="secondary" leftIcon={<RotateCcw className="h-4 w-4" />} onClick={() => setReopenOpen(true)}>
                {t.reopenEdit}
              </Button>
            )}
            <Button onClick={() => goStep("submit")}>{t.toSubmit}</Button>
          </>
        )}
      </StickyActionBar>


      <Dialog open={reopenOpen} onOpenChange={setReopenOpen}>
        <DialogContent title={t.reopenDialogTitle} icon={<RotateCcw className="h-4 w-4" />} description={`${kindLabel} · ${dossier.code}`} size="sm">
          <p className="text-sm text-fg-muted">{t.reopenDialogBody}</p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReopenOpen(false)}>
              {t.cancel}
            </Button>
            <Button loading={reopen.isPending} onClick={() => reopen.mutate()}>
              {t.reopenAction}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={recallOpen} onOpenChange={setRecallOpen}>
        <DialogContent title={t.recallRemainingTitle} icon={<RotateCcw className="h-4 w-4" />} description={`${kindLabel} · ${dossier.code}`} size="sm">
          <p className="text-sm text-fg-muted">{fill(t.recallRemainingBody, { sheets: lockedSheets })}</p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRecallOpen(false)}>
              {t.cancel}
            </Button>
            <Button loading={recallRest.isPending} disabled={recallBusy} leftIcon={<RotateCcw className="h-4 w-4" />} onClick={() => recallRest.mutate()}>
              {t.recallRemainingAction}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent title={t.approveDecl} icon={<ShieldCheck className="h-4 w-4" />} description={`${kindLabel} · ${dossier.code}`} size="sm">
          <Stack gap="md">
            <div className="divide-y divide-border rounded-md border border-border px-3">
              <KeyValue label={t.partner} value={dossier.partner} />
              <KeyValue label={t.valueEstimate} value={formatVnd(decl.customsValueVnd)} />
              {decl.kind === "IDA" && <KeyValue strong label={t.taxEstimate} value={formatVnd(totalTax)} />}
            </div>
            {suspect.length > 0 && (
              <>
                <Alert tone="warning">
                  {fill(t.suspectWarn, { n: suspect.length })}
                </Alert>
                <Checkbox label={t.suspectCheck} checked={checked} onChange={(e) => setChecked(e.currentTarget.checked)} />
              </>
            )}
            <p className="text-xs text-fg-subtle">{t.approveNote}</p>
          </Stack>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              {t.cancel}
            </Button>
            <Button loading={approve.isPending} disabled={suspect.length > 0 && !checked} onClick={() => approve.mutate()}>
              {t.approve}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Stack>
  );
}
