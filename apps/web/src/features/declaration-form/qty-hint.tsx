"use client";
// Chú thích quy đổi lượng ở dòng tờ khai (ADR 0015, spec danh mục §5): ĐVT invoice khác ĐVT khai (ĐVT của mã bộ Hải quan) → hiện phép tính
// "n ĐVT × hệ số = lượng ĐVT khai" theo hệ số lô (packing list) hoặc hệ số danh mục. Lô lệch > 20% → cảnh báo, không chặn.
// Sửa hệ số theo lô: PUT /api/line-items/:id/unit-factor (backend ghi field_audit, tờ khai đã khóa → lỗi).
// Mặt hàng có ĐVT số lượng 2 (spec 2026-11-14 số lượng 2) → thêm dòng "n ĐVT × factor = qty ĐVT2 (Số lượng (2) theo danh mục)" – hiện cả khi không có gợi ý lượng.
import type { LineItem } from "@kb/contracts";
import { Alert, Button, Field, fill, Input, Stack, toast, useMessages } from "@kb/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { RotateCcw, Save } from "lucide-react";
import { useState, type FormEvent } from "react";
import { setLineUnitFactor } from "@/api/catalog";
import { declarationKeys } from "@/api/declaration";
import { formatDecimal } from "@/lib/format";
import { toastMutationError } from "@/lib/mutation-error";
import { QTY_HINT_MESSAGES } from "./qty-hint.messages";

export function QtySuggestionHint({ item, dossierId, editable }: { item: LineItem; dossierId: string; editable: boolean }) {
  const t = useMessages(QTY_HINT_MESSAGES);
  const qc = useQueryClient();
  const [factor, setFactor] = useState("");
  const save = useMutation({
    mutationFn: (f: string | null) => setLineUnitFactor(item.id, f),
    onSuccess: (_line, f) => {
      void qc.invalidateQueries({ queryKey: declarationKeys.items(dossierId) });
      void qc.invalidateQueries({ queryKey: declarationKeys.view(dossierId) });
      toast({ tone: "success", title: fill(f === null ? t.cleared : t.saved, { line: item.lineNo }) });
      setFactor("");
    },
    onError: toastMutationError(t.saveFailed),
  });
  const s = item.qtySuggestion;
  const q2 = item.quantity2;
  if (!s && !q2) return null;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (factor.trim()) save.mutate(factor.trim());
  };
  const calc = s
    ? fill(t.calc, {
        n: formatDecimal(item.quantity), unit: item.unit, factor: formatDecimal(s.factor), qty: formatDecimal(s.qty), unit2: s.unit,
        source: s.lotFactor ? t.sourceLot : t.sourceCatalog,
      })
    : null;
  // Số lượng (2) – 1.84/2.73 – theo ĐVT 2 + tỷ lệ của mặt hàng (backend/mock tính sẵn, đã gồm hệ số theo lô nếu có).
  const calc2 = q2 ? fill(t.calc2, { n: formatDecimal(item.quantity), unit: item.unit, factor: formatDecimal(q2.factor, 9), qty: formatDecimal(q2.qty, 2), unit2: q2.unit }) : null;

  return (
    <Alert tone={s?.deviates ? "warning" : "info"} title={s ? t.title : t.title2}>
      <Stack gap="sm">
        {calc && <p className="tabular-nums">{calc}</p>}
        {calc2 && <p className="tabular-nums">{calc2}</p>}
        {s?.deviates && <p>{t.deviates}</p>}
        {editable && s && (
          <form onSubmit={submit} noValidate className="flex flex-wrap items-end gap-2">
            <Field label={fill(t.lotLabel, { unit: item.unit })} hint={t.lotHint} className="min-w-0 flex-1 basis-48">
              <Input value={factor} onChange={(e) => setFactor(e.target.value)} inputMode="decimal" maxLength={20} placeholder={t.lotPlaceholder} />
            </Field>
            <Button type="submit" size="sm" variant="secondary" leftIcon={<Save className="h-4 w-4" />} disabled={!factor.trim()} loading={save.isPending && save.variables !== null}>
              {t.saveLot}
            </Button>
            {s.lotFactor && (
              <Button type="button" size="sm" variant="ghost" leftIcon={<RotateCcw className="h-4 w-4" />} loading={save.isPending && save.variables === null} onClick={() => save.mutate(null)}>
                {t.clearLot}
              </Button>
            )}
          </form>
        )}
      </Stack>
    </Alert>
  );
}
