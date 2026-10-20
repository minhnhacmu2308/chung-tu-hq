"use client";
// Tờ khai dạng bản in VNACCS (bước 5 Review): giá trị người khai (dossier-adapter) + Hải quan trả về (customs-adapter) + số ứng dụng ước tính
// cho ô Hải quan còn trống; trạng thái ô (lỗi Hải quan, còn thiếu, ước tính, đã sửa). Bấm ô → chọn ô (panel sửa ở Task 7).
import { Alert, Button, Stack } from "@kb/ui";
import { parseItemFieldCode, printTitle, type Declaration, type DeclarationEditMode, type LineItem, type SubmissionView } from "@kb/contracts";
import { ArrowDown } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { customsItemValues, customsValues } from "../declaration-form/customs-adapter";
import { declarationValues, itemValues } from "../declaration-form/dossier-adapter";
import type { FormValues } from "../declaration-form/form-state";
import { fieldErrors } from "../dossier-detail/steps/customs-errors";
import { OtherFields } from "./other-fields";
import type { CellLook } from "./print-cell";
import { regionDomId, PrintSheets } from "./print-sheets";
import {
  attentionCells, cellState, editedKeys, errorSlots, estimateValues, fieldLocator, printValue, sameNumber, type Estimate, type PrintTarget,
} from "./print-state";

type Kind = "IDA" | "EDA";

type Props = {
  dossierId: string;
  decl: Declaration;
  items: LineItem[];
  /** Chế độ sửa theo giai đoạn (dùng ở panel sửa – Task 7). */
  mode: DeclarationEditMode;
  canEdit: boolean;
  submission: SubmissionView | undefined;
  /** Số ô cần xử lý (lỗi + còn thiếu) – gọi lại mỗi khi đổi (huy hiệu tab). */
  onAttentionChange?: (n: number) => void;
};

const slotId = (key: string, line?: number) => `${line ?? ""}:${key}`;

function printModel(decl: Declaration, items: LineItem[], submission: SubmissionView | undefined) {
  const kind: Kind = decl.kind;
  const lineNos = items.map((it) => it.lineNo);
  const currency = decl.fields.find((f) => f.code === "MA_TT")?.value.trim() || "USD";
  const vbpq = decl.fields.find((f) => f.code === "VBPQ")?.value ?? "";
  const info = submission?.customsInfo ?? null;

  const customs = customsValues(kind, info, submission?.result ?? null);
  const est: Estimate = {
    customsValueVnd: decl.customsValueVnd, currency, exchangeRate: decl.exchangeRate, lines: items.length,
    ...(kind === "IDA" ? { taxVnd: String(Number(decl.estimatedImportDutyVnd) + Number(decl.estimatedVatVnd)) } : {}),
  };
  const { values: customsFilled, estimated } = estimateValues(kind, customs, est);
  const estimate = estimateValues(kind, {}, est).values;
  const values: FormValues = { ...declarationValues(kind, decl.fields), ...customsFilled };
  const customsItems = customsItemValues(kind, info, lineNos);
  const itemRows = itemValues(kind, items, { fields: decl.fields, currency, vbpq }).map((v, i) => ({ ...v, ...customsItems[i] }));

  const errors = fieldErrors(kind, submission?.rejection ?? null);
  const errorIds = new Set(errorSlots(kind, errors, lineNos).map((s) => slotId(s.key, s.line)));
  const attention = attentionCells(kind, values, itemRows, errors, lineNos);
  const missingIds = new Set(attention.filter((c) => c.reason === "MISSING").map((c) => slotId(c.key, c.line)));
  const editedDecl = editedKeys(kind, decl.fields);
  const editedItem = items.map((it) => editedKeys(kind, decl.fields.filter((f) => parseItemFieldCode(f.code)?.itemId === it.id)));

  const loc = fieldLocator(kind);
  /** Ô Hải quan có số trả về khác số ước tính → số ước tính gạch ngang bên cạnh. */
  const compareTo = (key: string): string | null => {
    const field = loc.get(key)?.field;
    const got = customs[key]?.trim();
    const app = estimate[key]?.trim();
    if (field?.origin !== "CUSTOMS" || !got || !app || got === app || sameNumber(got, app)) return null;
    return printValue(field, app);
  };
  const look = (key: string, line?: number): CellLook => {
    const id = slotId(key, line);
    const raw = (line === undefined ? values[key] : itemRows[line]?.[key]) ?? "";
    const state = cellState({
      error: errorIds.has(id),
      missing: missingIds.has(id),
      estimated: line === undefined && estimated.has(key),
      edited: line === undefined ? editedDecl.has(key) : Boolean(editedItem[line]?.has(key)),
    });
    return { raw, state, compareTo: line === undefined ? compareTo(key) : null };
  };
  return { kind, values, itemRows, attention, look, directives: info?.directives.length ?? 0 };
}

export function PrintDeclaration({ decl, items, submission, onAttentionChange }: Props) {
  const [selected, setSelected] = useState<PrintTarget | null>(null);
  const model = useMemo(() => printModel(decl, items, submission), [decl, items, submission]);
  const attentionCount = model.attention.length;
  useEffect(() => onAttentionChange?.(attentionCount), [attentionCount, onAttentionChange]);

  const scrollToDirectives = () => document.getElementById(regionDomId("chi-thi"))?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <Stack gap="md">
      {model.directives > 0 && (
        <Alert
          tone="warning"
          title={`Hải quan có ${model.directives} chỉ thị`}
          action={
            <Button size="sm" variant="secondary" leftIcon={<ArrowDown className="h-4 w-4" />} onClick={scrollToDirectives}>
              Xem chỉ thị
            </Button>
          }
        />
      )}
      <PrintSheets
        kind={model.kind}
        title={printTitle(model.kind, submission?.stage)}
        lines={items.length}
        look={model.look}
        selected={selected}
        onSelect={setSelected}
      />
      <OtherFields kind={model.kind} decl={model.values} items={model.itemRows} look={model.look} selected={selected} onSelect={setSelected} />
    </Stack>
  );
}
