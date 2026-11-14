"use client";
// Thiết lập danh mục lần đầu (Quản trị/Chủ – spec §4): bước 1 chọn chế độ; bước 2
// - SHARED: tên "Mã chung" + người phụ trách + tiền tố mã nối → thiết lập rồi chuyển thẳng sang tab Nhập dữ liệu (nhập một file là xong);
// - PER_DEPARTMENT: tiền tố, ba bộ Kế toán/Kho/XNK (tên + người phụ trách chọn nhiều), mã hiển thị chính, bộ nguồn gốc (bắt buộc, gợi ý XNK).
// Bộ nguồn gốc (spec 2026-11-14 §1) quyết định ĐVT gốc + tên/HS/thuế của mặt hàng; dùng chung → bộ "Mã chung" tự là nguồn gốc.
import { SetupCatalogInputSchema, type CatalogMode, type CodeSetKind, type SetupCatalogInput } from "@kb/contracts";
import {
  Alert, Button, Combobox, Dialog, DialogContent, DialogFooter, Field, fill, FormSection, Input, RadioGroup, Select, Stack, statusLabel, toast, useMessages, useUiLocale,
} from "@kb/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Settings2 } from "lucide-react";
import { useState } from "react";
import { catalogKeys, setupCatalog } from "@/api/catalog";
import { getFormatLocale } from "@/lib/format";
import { errorText } from "@/lib/reason-codes";
import { CATALOG_SETS_MESSAGES } from "./catalog.messages";
import { useOwnerOptions } from "./code-set-dialog";
import { codeSetStatus } from "./code-set-label";
import { CATALOG_SOURCE_MESSAGES } from "./source-set.messages";

type SetupKind = "SHARED" | "ACCOUNTING" | "WAREHOUSE" | "CUSTOMS";
type SourceKind = NonNullable<SetupCatalogInput["sourceKind"]>;
const KINDS_OF: Record<CatalogMode, readonly SetupKind[]> = { SHARED: ["SHARED"], PER_DEPARTMENT: ["ACCOUNTING", "WAREHOUSE", "CUSTOMS"] };
type Draft = { name: string; ownerIds: string[] };

export function SetupWizard({ prefix: initialPrefix, onClose, onSharedDone }: { prefix: string; onClose: () => void; onSharedDone: () => void }) {
  const t = useMessages(CATALOG_SETS_MESSAGES);
  const ts = useMessages(CATALOG_SOURCE_MESSAGES);
  const locale = useUiLocale();
  const [sourceKind, setSourceKind] = useState<SourceKind>("CUSTOMS");
  const qc = useQueryClient();
  const owners = useOwnerOptions();
  const [step, setStep] = useState<1 | 2>(1);
  const [mode, setMode] = useState<CatalogMode | null>(null);
  const [prefix, setPrefix] = useState(initialPrefix);
  const [drafts, setDrafts] = useState<Record<SetupKind, Draft>>(() => ({
    SHARED: { name: t.defaultNameSHARED, ownerIds: [] },
    ACCOUNTING: { name: t.defaultNameACCOUNTING, ownerIds: [] },
    WAREHOUSE: { name: t.defaultNameWAREHOUSE, ownerIds: [] },
    CUSTOMS: { name: t.defaultNameCUSTOMS, ownerIds: [] },
  }));
  const [primaryKind, setPrimaryKind] = useState<CodeSetKind | "">("ACCOUNTING");
  const kinds = mode ? KINDS_OF[mode] : [];
  const kindLabel = (k: CodeSetKind) => statusLabel(codeSetStatus(k), locale);
  const patch = (k: SetupKind, d: Partial<Draft>) => setDrafts((all) => ({ ...all, [k]: { ...all[k], ...d } }));
  // Kiểm tiền tố bằng chính schema của route (1–10 ký tự chữ không dấu / số / - _ .).
  const prefixOk = SetupCatalogInputSchema.shape.prefix.safeParse(prefix).success && prefix.trim() !== "";
  const valid = !!mode && kinds.every((k) => drafts[k].name.trim()) && prefixOk;

  const run = useMutation({
    mutationFn: (m: CatalogMode) =>
      setupCatalog({
        mode: m, prefix: prefix.trim(),
        sets: KINDS_OF[m].map((k) => ({ kind: k, name: drafts[k].name.trim(), ownerIds: drafts[k].ownerIds })),
        primaryDisplayKind: m === "SHARED" ? "SHARED" : primaryKind || null,
        ...(m === "PER_DEPARTMENT" ? { sourceKind } : {}),
      }),
    onSuccess: (_, m) => {
      void qc.invalidateQueries({ queryKey: catalogKeys.all });
      toast({ tone: "success", title: t.setupDone });
      onClose();
      if (m === "SHARED") onSharedDone();
    },
  });

  const modeOptions = [
    { value: "SHARED" as const, label: t.modeSHAREDOption, description: t.modeSHAREDHint },
    { value: "PER_DEPARTMENT" as const, label: t.modePER_DEPARTMENT, description: t.modePER_DEPARTMENTHint },
  ];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={t.setupTitle}
        description={step === 1 || !mode ? t.setupStep1 : fill(t.setupStep2, { mode: mode === "SHARED" ? t.modeSHARED : t.modePER_DEPARTMENT })}
        icon={<Settings2 className="h-4 w-4" />}
        size="lg"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (step === 1) {
              if (mode) setStep(2);
            } else if (mode && valid) run.mutate(mode);
          }}
        >
          {step === 1 ? (
            <RadioGroup label={t.modeQuestion} options={modeOptions} value={mode} onChange={setMode} />
          ) : (
            <Stack gap="md">
              {run.isError && <Alert tone="danger">{errorText(run.error, getFormatLocale(), t.setupFailed)}</Alert>}
              <Field
                label={t.prefix}
                required
                hint={fill(t.prefixHint, { example: `${prefixOk ? prefix.trim() : initialPrefix}000001` })}
                {...(prefixOk ? {} : { error: t.prefixInvalid })}
              >
                <Input value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder={t.prefixPlaceholder} className="cq-md:max-w-xs" maxLength={10} />
              </Field>
              {kinds.map((k) => (
                <FormSection key={k} title={kindLabel(k)}>
                  <Stack gap="md">
                    <Field label={fill(t.setName, { kind: kindLabel(k) })} required>
                      <Input value={drafts[k].name} onChange={(e) => patch(k, { name: e.target.value })} placeholder={t.namePlaceholder} />
                    </Field>
                    <Field label={fill(t.setOwners, { kind: kindLabel(k) })} hint={t.ownersHint}>
                      <Combobox multiple options={owners} value={drafts[k].ownerIds} onChange={(ids) => patch(k, { ownerIds: ids })} placeholder={t.ownersPlaceholder} emptyText={t.ownersEmpty} />
                    </Field>
                  </Stack>
                </FormSection>
              ))}
              {mode === "PER_DEPARTMENT" && (
                <Field label={t.primaryDisplay} hint={t.primaryDisplayHint}>
                  <Select
                    options={[...kinds.map((k) => ({ value: k, label: drafts[k].name.trim() || kindLabel(k) })), { value: "", label: t.primaryNone }]}
                    value={primaryKind}
                    onChange={(e) => setPrimaryKind(e.target.value as CodeSetKind | "")}
                  />
                </Field>
              )}
              {mode === "PER_DEPARTMENT" && (
                <Stack gap="sm">
                  <RadioGroup
                    label={ts.question}
                    options={(["ACCOUNTING", "WAREHOUSE", "CUSTOMS"] as const).map((k) => ({ value: k, label: drafts[k].name.trim() || kindLabel(k), description: ts[`optionHint${k}`] }))}
                    value={sourceKind}
                    onChange={setSourceKind}
                  />
                  <p className="text-sm text-fg-muted">{ts.hint}</p>
                </Stack>
              )}
              {mode === "SHARED" && <Alert tone="info">{fill(ts.sharedNote, { name: drafts.SHARED.name.trim() || t.defaultNameSHARED })}</Alert>}
            </Stack>
          )}
          <DialogFooter>
            {step === 1 ? (
              <Button type="button" variant="ghost" onClick={onClose}>{t.cancel}</Button>
            ) : (
              <Button type="button" variant="ghost" onClick={() => setStep(1)}>{t.back}</Button>
            )}
            {step === 1 ? (
              <Button type="submit" disabled={!mode}>{t.next}</Button>
            ) : (
              <Button type="submit" loading={run.isPending} disabled={!valid}>{mode === "SHARED" ? t.setupShared : t.setupPer}</Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
