"use client";
// Bước 3 – OCR & kiểm tra: đối chiếu chéo ở đầu; mỗi chứng từ một tab: trái chứng từ gốc, phải kết quả theo nhóm.
// Rê chuột/focus vào trường → tô vùng trên chứng từ; bấm vùng trên chứng từ → nhảy tới trường.
// ?dong=<số dòng> (từ panel dòng hàng của tờ khai đầy đủ): mở chứng từ có dòng đó và đưa con trỏ tới ô mô tả của dòng.
import {
  Alert, Badge, Button, Card, CardContent, CardHeader, CardTitle, Dialog, DialogContent, DialogFooter, EmptyState, SegmentedControl,
  Skeleton, Stack, Tabs, TabsContent, TabsList, TabsTrigger, fill, toast, useMessages,
} from "@kb/ui";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, ArrowRight } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { getDocumentFile, isSuspect, listChecks, listDossierDocuments, listFields, ocrKeys } from "@/api/ocr";
import { learnFromReview, suggestAlias } from "@/api/skills";
import { DocumentPreview, type DocumentTextApi, type OriginalFile, type PickResult } from "@/components/common/document-preview";
import { ApiError } from "@/lib/api-error";
import { DOC_KIND_LABELS, FIELD_GROUP_LABELS, type DossierDocument, type ExtractedField } from "@/mocks/types";
import { CrossCheckPanel } from "../ocr/cross-check-panel";
import { DocumentSheetsCard } from "../ocr/document-sheets";
import { FieldRow, fieldDomId } from "../ocr/field-row";
import { ItemsTable } from "../ocr/items-table";
import { SKILL_LEARN_MESSAGES } from "../ocr/ocr.messages";
import { useFieldMutations } from "../ocr/use-field-mutations";
import { ValueChargesCard } from "../ocr/value-charges-card";
import { useAdvanceDossier } from "../use-advance";
import type { StepProps } from "./types";
import { OCR_STEP_MESSAGES } from "./ocr-step.messages";

const GROUPS = Object.keys(FIELD_GROUP_LABELS.vi) as ExtractedField["group"][];
type Filter = "all" | "suspect";

function DocumentTab({ doc, fields, dossierId, filter, focusId }: { doc: DossierDocument; fields: ExtractedField[]; dossierId: string; filter: Filter; focusId?: string | undefined }) {
  const t = useMessages(OCR_STEP_MESSAGES);
  const groupLabels = useMessages(FIELD_GROUP_LABELS);
  const [active, setActive] = useState<string | null>(null);
  const m = useFieldMutations(dossierId);
  // Link file gốc hết hạn sau 10 phút → lấy lại sau 8 phút.
  const fileQuery = useQuery({
    queryKey: ocrKeys.file(doc.id),
    queryFn: () => getDocumentFile(doc.id),
    staleTime: 8 * 60_000,
    refetchInterval: (q) => (q.state.data ? 8 * 60_000 : false),
    retry: (n, e) => !(e instanceof ApiError && e.code === "FILE_MISSING") && n < 2,
  });
  const file: OriginalFile = fileQuery.isPending
    ? { status: "loading" }
    : fileQuery.error instanceof ApiError && fileQuery.error.code === "FILE_MISSING"
      ? { status: "missing" }
      : fileQuery.isError
      ? { status: "error", retry: () => void fileQuery.refetch() }
      : fileQuery.data
        ? { status: "ready", url: fileQuery.data.url }
        : { status: "none" };
  const tl = useMessages(SKILL_LEARN_MESSAGES);
  // Lớp chữ của file gốc (PDF chuẩn): tìm nhãn in cạnh giá trị người dùng sửa → gợi ý alias cho skill.
  const [textApi, setTextApi] = useState<DocumentTextApi | null>(null);
  const textRef = useRef(textApi);
  textRef.current = textApi;
  const [pick, setPick] = useState<ExtractedField | null>(null);
  const canPick = !!textApi?.hasText;

  /** Ghi nhận nhãn (không chặn việc sửa; lỗi bỏ qua). `announce`: báo cho người dùng khi là gợi ý mới. */
  const noteLabel = (fieldId: string, label: string | null, announce: boolean) => {
    if (!label) return;
    suggestAlias(fieldId, label)
      .then((s) => {
        if (s && announce && s.hits === 1) toast({ tone: "info", title: fill(tl.aliasNoted, { alias: s.alias }) });
      })
      .catch(() => {});
  };
  const save = (id: string, value: string) =>
    m.update.mutate(
      { id, value },
      {
        onSuccess: (f) => {
          const api = textRef.current;
          if (!api?.hasText || !f.value) return;
          const region = api.locate(f.value);
          if (region) noteLabel(f.id, api.labelAt(region, f.value), false);
        },
      },
    );
  const confirm = (id: string) => m.confirm.mutate(id);
  const revert = (id: string) => m.revert.mutate(id);

  const onPick = ({ text, label }: PickResult) => {
    const f = pick;
    setPick(null);
    if (!f) return;
    if (!text) return void toast({ tone: "warning", title: tl.pickEmpty, description: tl.pickEmptyDesc });
    m.update.mutate(
      { id: f.id, value: text },
      {
        onSuccess: (saved) => {
          toast({ tone: "success", title: fill(tl.pickFilled, { label: f.label, value: saved.value }) });
          noteLabel(f.id, label, true);
        },
      },
    );
  };
  useEffect(() => {
    if (!pick) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPick(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pick]);

  const jumpTo = (id: string) => {
    setActive(id);
    const el = document.getElementById(fieldDomId(id));
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    document.getElementById(`${fieldDomId(id)}-input`)?.focus({ preventScroll: true });
  };

  // Mở từ tờ khai đầy đủ: nhảy tới dòng hàng cần sửa khi tab đã hiện.
  useEffect(() => {
    if (!focusId) return;
    const t = requestAnimationFrame(() => jumpTo(focusId));
    return () => cancelAnimationFrame(t);
  }, [focusId]);

  const visible = filter === "suspect" ? fields.filter((f) => isSuspect(f.status)) : fields;
  const items = fields.filter((f) => f.group === "ITEMS");
  const showItems = items.length > 0 && (filter === "all" || items.some((f) => isSuspect(f.status)));

  return (
    <div className="grid grid-cols-1 gap-4 cq-lg:grid-cols-2">
      {pick && (
        <Alert
          tone="info"
          className="cq-lg:col-span-2"
          title={fill(tl.pickTitle, { label: pick.label })}
          action={
            <Button size="sm" variant="secondary" onClick={() => setPick(null)}>
              {tl.pickCancel}
            </Button>
          }
        >
          {tl.pickBody}
        </Alert>
      )}
      <DocumentPreview
        document={doc}
        file={file}
        fields={fields}
        highlightFieldId={pick ? null : active}
        onFieldClick={jumpTo}
        picking={!!pick}
        onPick={onPick}
        onTextReady={setTextApi}
        className="h-120 cq-lg:sticky cq-lg:top-shell cq-lg:h-176 cq-lg:self-start"
      />
      <Stack gap="md" className="min-w-0">
        {visible.length === 0 && !showItems ? (
          <EmptyState title={t.nothingToReview} description={t.nothingToReviewDesc} />
        ) : null}
        {GROUPS.filter((g) => g !== "ITEMS").map((g) => {
          const list = visible.filter((f) => f.group === g);
          if (!list.length) return null;
          return (
            <section key={g} aria-labelledby={`grp-${doc.id}-${g}`} className="flex flex-col gap-1">
              <h3 id={`grp-${doc.id}-${g}`} className="px-1 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                {groupLabels[g]}
              </h3>
              {list.map((f) => (
                <FieldRow
                  key={f.id}
                  field={f}
                  active={active === f.id}
                  onActivate={setActive}
                  onSave={save}
                  onConfirm={confirm}
                  onRevert={revert}
                  picking={pick?.id === f.id}
                  {...(canPick ? { onPick: (id: string) => setPick(fields.find((x) => x.id === id) ?? null) } : {})}
                />
              ))}
            </section>
          );
        })}
        {showItems && (
          <section aria-labelledby={`grp-${doc.id}-items`} className="flex flex-col gap-2">
            <h3 id={`grp-${doc.id}-items`} className="px-1 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
              {groupLabels.ITEMS}
            </h3>
            <ItemsTable fields={items} activeId={active} onActivate={setActive} onSave={save} onConfirm={confirm} />
          </section>
        )}
      </Stack>
    </div>
  );
}

export function OcrStep({ dossier, goTo }: StepProps) {
  const t = useMessages(OCR_STEP_MESSAGES);
  const kindLabels = useMessages(DOC_KIND_LABELS);
  const docsQuery = useQuery({ queryKey: ocrKeys.documents(dossier.id), queryFn: () => listDossierDocuments(dossier.id) });
  const fieldsQuery = useQuery({ queryKey: ocrKeys.fields(dossier.id), queryFn: () => listFields(dossier.id) });
  const checksQuery = useQuery({ queryKey: ocrKeys.checks(dossier.id), queryFn: () => listChecks(dossier.id) });
  const advance = useAdvanceDossier(dossier.id, goTo);
  const [filter, setFilter] = useState<Filter>("all");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const docs = useMemo(() => (docsQuery.data ?? []).filter((d) => d.status === "DONE"), [docsQuery.data]);
  const fields = fieldsQuery.data ?? [];
  const byDoc = (id: string) => fields.filter((f) => f.documentId === id);
  const suspectOf = (id: string) => byDoc(id).filter((f) => isSuspect(f.status)).length;
  const suspectTotal = fields.filter((f) => isSuspect(f.status)).length;
  const suspectDocs = docs.filter((d) => suspectOf(d.id) > 0).length;
  const blockers = (checksQuery.data ?? []).filter((c) => c.result === "FAIL" && c.severity === "BLOCKER").length;
  const [tab, setTab] = useState<string | undefined>(undefined);
  const params = useSearchParams();
  const line = params.get("dong");
  const focus = line ? fields.find((f) => f.group === "ITEMS" && f.key === `item.${line}.description`) : undefined;
  const firstSuspect = docs.find((d) => suspectOf(d.id) > 0)?.id ?? docs[0]?.id;
  const currentTab = tab && docs.some((d) => d.id === tab) ? tab : (focus?.documentId ?? firstSuspect);

  const tl = useMessages(SKILL_LEARN_MESSAGES);
  // Xác nhận dữ liệu xong → chứng từ có trường bị sửa thành mẫu cho skill (tự học). Không chặn việc sang bước sau; lỗi bỏ qua.
  const learn = () =>
    learnFromReview(dossier.id)
      .then((r) => {
        if (!r.learned) return;
        const created = r.skills.find((s) => s.created);
        toast({ tone: "success", title: tl.learnedTitle, description: created ? fill(tl.learnedSupplier, { supplier: created.supplier ?? created.name }) : fill(tl.learnedDesc, { n: r.learned }) });
      })
      .catch(() => {});
  // mutateAsync: vẫn ghi nhớ khi màn này đã chuyển sang bước sau (callback của mutate() không chạy khi component đã gỡ).
  const proceed = () =>
    void advance
      .mutateAsync({ patch: { step: "agent", suspectFields: suspectTotal }, to: "agent" })
      .then(learn)
      .catch(() => {});
  const onConfirmData = () => (suspectTotal > 0 || blockers > 0 ? setConfirmOpen(true) : proceed());
  const alreadyPast = dossier.step !== "ocr";

  const loading = docsQuery.isLoading || fieldsQuery.isLoading;
  const failed = docsQuery.isError || fieldsQuery.isError;

  return (
    <Stack gap="lg">
      {line && fieldsQuery.isSuccess && !focus && (
        <Alert tone="info" title={fill(t.lineMissingTitle, { line })}>
          {t.lineMissingBody}
        </Alert>
      )}
      <CrossCheckPanel checks={checksQuery.data} loading={checksQuery.isLoading} />

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle>{t.title}</CardTitle>
          <SegmentedControl<Filter>
            label={t.show}
            hideLabel
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: t.allFields },
              { value: "suspect", label: fill(t.needsReview, { n: suspectTotal }) },
            ]}
          />
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="grid grid-cols-1 gap-4 cq-lg:grid-cols-2">
              {/* kb-allow-raw: giữ chỗ đúng bằng chiều cao khung xem chứng từ (h-120) để trang không nhảy khi ảnh về */}
              <Skeleton className="h-120" />
              <Stack gap="sm">
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
              </Stack>
            </div>
          ) : failed ? (
            <Alert
              tone="danger"
              title={t.loadFailed}
              action={
                <Button size="sm" variant="secondary" onClick={() => void fieldsQuery.refetch()}>
                  {t.retry}
                </Button>
              }
            />
          ) : docs.length === 0 ? (
            <EmptyState
              title={t.noDocsTitle}
              description={t.noDocsDesc}
              action={<Button onClick={() => goTo("upload")}>{t.backToUpload}</Button>}
            />
          ) : (
            <Tabs value={currentTab ?? ""} onValueChange={setTab}>
              <TabsList aria-label={t.docsAria}>
                {docs.map((d) => {
                  const n = suspectOf(d.id);
                  return (
                    <TabsTrigger key={d.id} value={d.id}>
                      {kindLabels[d.kind]}
                      {n > 0 ? (
                        <Badge tone="warning" aria-label={fill(t.suspectAria, { n })}>
                          {n}
                        </Badge>
                      ) : null}
                    </TabsTrigger>
                  );
                })}
              </TabsList>
              {docs.map((d) => (
                <TabsContent key={d.id} value={d.id} className="pt-4">
                  <DocumentTab doc={d} fields={byDoc(d.id)} dossierId={dossier.id} filter={filter} focusId={focus?.documentId === d.id ? focus.id : undefined} />
                </TabsContent>
              ))}
            </Tabs>
          )}
        </CardContent>
      </Card>

      <ValueChargesCard dossierId={dossier.id} currency={dossier.currency} />

      <DocumentSheetsCard dossierId={dossier.id} dossierCode={dossier.code} />

      {/* Thanh hành động dính đáy màn hình. kb-allow-raw: lề âm/lề phải bám lề của shell và nút trợ lý AI nổi – cả hai theo bề rộng màn hình */}
      <div className="sticky bottom-0 z-10 -mx-4 border-t border-border bg-surface py-3 pl-4 pr-20 shadow-md md:-mx-8 md:pl-8 md:pr-24">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <p className="min-w-0 basis-full text-sm text-fg-muted cq-sm:flex-1 cq-sm:basis-auto" aria-live="polite">
            {loading ? (
              t.loading
            ) : suspectTotal > 0 ? (
              <>
                {t.remainingPrefix}
                <span className="font-semibold text-warning-subtle-fg">{fill(t.remainingSuspect, { n: suspectTotal })}</span>
                {fill(t.remainingSuffix, { docs: suspectDocs })}
              </>
            ) : (
              <span className="font-medium text-success-subtle-fg">{t.allClear}</span>
            )}
            {blockers > 0 && <span className="text-danger-subtle-fg">{fill(t.blockers, { n: blockers })}</span>}
          </p>
          <Button variant="ghost" leftIcon={<ArrowLeft className="h-4 w-4" />} onClick={() => goTo("upload")}>
            <span className="cq-max-sm:sr-only">{t.documents}</span>
          </Button>
          {alreadyPast ? (
            <Button rightIcon={<ArrowRight className="h-4 w-4" />} onClick={() => goTo("agent")}>
              {t.toAgent}
            </Button>
          ) : (
            <Button className="cq-max-sm:flex-1" rightIcon={<ArrowRight className="h-4 w-4" />} loading={advance.isPending} disabled={docs.length === 0} onClick={onConfirmData}>
              {t.confirmData}
            </Button>
          )}
        </div>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent
          title={t.confirmTitle}
          icon={<AlertTriangle className="h-4 w-4" />}
          description={t.confirmDesc}
          size="sm"
        >
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-fg-muted">
            {suspectTotal > 0 && <li>{fill(t.confirmSuspect, { n: suspectTotal })}</li>}
            {blockers > 0 && <li>{fill(t.confirmBlockers, { n: blockers })}</li>}
          </ul>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              {t.reviewAgain}
            </Button>
            <Button
              loading={advance.isPending}
              onClick={() => {
                setConfirmOpen(false);
                proceed();
              }}
            >
              {t.continueAnyway}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Stack>
  );
}
