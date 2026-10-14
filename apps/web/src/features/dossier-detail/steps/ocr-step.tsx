"use client";
// Bước 3 – OCR & kiểm tra: đối chiếu chéo ở đầu; mỗi chứng từ một tab: trái chứng từ gốc, phải kết quả theo nhóm.
// Rê chuột/focus vào trường → tô vùng trên chứng từ; bấm vùng trên chứng từ → nhảy tới trường.
import {
  Alert, Badge, Button, Card, CardContent, CardHeader, CardTitle, Dialog, DialogContent, DialogFooter, EmptyState, SegmentedControl,
  Skeleton, Stack, Tabs, TabsContent, TabsList, TabsTrigger,
} from "@kb/ui";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useMemo, useState } from "react";
import { isSuspect, listChecks, listDossierDocuments, listFields, ocrKeys } from "@/api/ocr";
import { DocumentPreview } from "@/components/common/document-preview";
import { DOC_KIND_LABELS, FIELD_GROUP_LABELS, type DossierDocument, type ExtractedField } from "@/mocks/types";
import { CrossCheckPanel } from "../ocr/cross-check-panel";
import { FieldRow, fieldDomId } from "../ocr/field-row";
import { ItemsTable } from "../ocr/items-table";
import { useFieldMutations } from "../ocr/use-field-mutations";
import { useAdvanceDossier } from "../use-advance";
import type { StepProps } from "./types";

const GROUPS = Object.keys(FIELD_GROUP_LABELS) as ExtractedField["group"][];
type Filter = "all" | "suspect";

function DocumentTab({ doc, fields, dossierId, filter }: { doc: DossierDocument; fields: ExtractedField[]; dossierId: string; filter: Filter }) {
  const [active, setActive] = useState<string | null>(null);
  const m = useFieldMutations(dossierId);
  const save = (id: string, value: string) => m.update.mutate({ id, value });
  const confirm = (id: string) => m.confirm.mutate(id);
  const revert = (id: string) => m.revert.mutate(id);

  const jumpTo = (id: string) => {
    setActive(id);
    const el = document.getElementById(fieldDomId(id));
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    document.getElementById(`${fieldDomId(id)}-input`)?.focus({ preventScroll: true });
  };

  const visible = filter === "suspect" ? fields.filter((f) => isSuspect(f.status)) : fields;
  const items = fields.filter((f) => f.group === "ITEMS");
  const showItems = items.length > 0 && (filter === "all" || items.some((f) => isSuspect(f.status)));

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <DocumentPreview
        document={doc}
        fields={fields}
        highlightFieldId={active}
        onFieldClick={jumpTo}
        className="h-120 lg:sticky lg:top-shell lg:h-176 lg:self-start"
      />
      <Stack gap="md" className="min-w-0">
        {visible.length === 0 && !showItems ? (
          <EmptyState title="Không còn trường cần xem" description="Mọi trường trên chứng từ này đã khớp hoặc đã được xác nhận." />
        ) : null}
        {GROUPS.filter((g) => g !== "ITEMS").map((g) => {
          const list = visible.filter((f) => f.group === g);
          if (!list.length) return null;
          return (
            <section key={g} aria-labelledby={`grp-${doc.id}-${g}`} className="flex flex-col gap-1">
              <h3 id={`grp-${doc.id}-${g}`} className="px-1 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                {FIELD_GROUP_LABELS[g]}
              </h3>
              {list.map((f) => (
                <FieldRow key={f.id} field={f} active={active === f.id} onActivate={setActive} onSave={save} onConfirm={confirm} onRevert={revert} />
              ))}
            </section>
          );
        })}
        {showItems && (
          <section aria-labelledby={`grp-${doc.id}-items`} className="flex flex-col gap-2">
            <h3 id={`grp-${doc.id}-items`} className="px-1 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
              {FIELD_GROUP_LABELS.ITEMS}
            </h3>
            <ItemsTable fields={items} activeId={active} onActivate={setActive} onSave={save} onConfirm={confirm} />
          </section>
        )}
      </Stack>
    </div>
  );
}

export function OcrStep({ dossier, goTo }: StepProps) {
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
  const firstSuspect = docs.find((d) => suspectOf(d.id) > 0)?.id ?? docs[0]?.id;
  const currentTab = tab && docs.some((d) => d.id === tab) ? tab : firstSuspect;

  const proceed = () => advance.mutate({ patch: { step: "agent", suspectFields: suspectTotal }, to: "agent" });
  const onConfirmData = () => (suspectTotal > 0 || blockers > 0 ? setConfirmOpen(true) : proceed());
  const alreadyPast = dossier.step !== "ocr";

  const loading = docsQuery.isLoading || fieldsQuery.isLoading;
  const failed = docsQuery.isError || fieldsQuery.isError;

  return (
    <Stack gap="lg">
      <CrossCheckPanel checks={checksQuery.data} loading={checksQuery.isLoading} />

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle>Kết quả đọc chứng từ</CardTitle>
          <SegmentedControl<Filter>
            label="Hiển thị"
            hideLabel
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "Tất cả trường" },
              { value: "suspect", label: `Cần xem (${suspectTotal})` },
            ]}
          />
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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
              title="Không tải được kết quả đọc"
              action={
                <Button size="sm" variant="secondary" onClick={() => void fieldsQuery.refetch()}>
                  Thử lại
                </Button>
              }
            />
          ) : docs.length === 0 ? (
            <EmptyState
              title="Chưa có chứng từ đã đọc"
              description="Upload chứng từ và chờ AI đọc xong để xem kết quả."
              action={<Button onClick={() => goTo("upload")}>Về bước Upload</Button>}
            />
          ) : (
            <Tabs value={currentTab ?? ""} onValueChange={setTab}>
              <TabsList aria-label="Chứng từ trong hồ sơ">
                {docs.map((d) => {
                  const n = suspectOf(d.id);
                  return (
                    <TabsTrigger key={d.id} value={d.id}>
                      {DOC_KIND_LABELS[d.kind]}
                      {n > 0 ? (
                        <Badge tone="warning" aria-label={`${n} trường cần xem`}>
                          {n}
                        </Badge>
                      ) : null}
                    </TabsTrigger>
                  );
                })}
              </TabsList>
              {docs.map((d) => (
                <TabsContent key={d.id} value={d.id} className="pt-4">
                  <DocumentTab doc={d} fields={byDoc(d.id)} dossierId={dossier.id} filter={filter} />
                </TabsContent>
              ))}
            </Tabs>
          )}
        </CardContent>
      </Card>

      {/* Thanh hành động dính đáy màn hình */}
      <div className="sticky bottom-0 z-10 -mx-4 border-t border-border bg-surface py-3 pl-4 pr-20 shadow-md md:-mx-8 md:pl-8 md:pr-24">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <p className="min-w-0 basis-full text-sm text-fg-muted sm:flex-1 sm:basis-auto" aria-live="polite">
            {loading ? (
              "Đang tải kết quả đọc…"
            ) : suspectTotal > 0 ? (
              <>
                Còn <span className="font-semibold text-warning-subtle-fg">{suspectTotal} trường nghi ngờ</span> trên {suspectDocs} chứng từ
              </>
            ) : (
              <span className="font-medium text-success-subtle-fg">Mọi trường đã khớp hoặc đã xác nhận</span>
            )}
            {blockers > 0 && <span className="text-danger-subtle-fg"> · {blockers} lỗi chặn truyền</span>}
          </p>
          <Button variant="ghost" leftIcon={<ArrowLeft className="h-4 w-4" />} onClick={() => goTo("upload")}>
            <span className="max-sm:sr-only">Chứng từ</span>
          </Button>
          {alreadyPast ? (
            <Button rightIcon={<ArrowRight className="h-4 w-4" />} onClick={() => goTo("agent")}>
              Sang AI Agent
            </Button>
          ) : (
            <Button className="max-sm:flex-1" rightIcon={<ArrowRight className="h-4 w-4" />} loading={advance.isPending} disabled={docs.length === 0} onClick={onConfirmData}>
              Xác nhận dữ liệu
            </Button>
          )}
        </div>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent
          title="Vẫn xác nhận dữ liệu?"
          description="Bạn có thể đi tiếp; các trường chưa xác nhận sẽ được đánh dấu trên tờ khai để người duyệt kiểm tra."
          size="sm"
        >
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-fg-muted">
            {suspectTotal > 0 && <li>{suspectTotal} trường nghi ngờ chưa xác nhận</li>}
            {blockers > 0 && <li>{blockers} luật lỗi chặn truyền – phải xử lý trước khi khai Hải quan</li>}
          </ul>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Xem lại
            </Button>
            <Button
              loading={advance.isPending}
              onClick={() => {
                setConfirmOpen(false);
                proceed();
              }}
            >
              Vẫn tiếp tục
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Stack>
  );
}
