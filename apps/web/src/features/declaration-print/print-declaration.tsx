"use client";
// Tờ khai dạng bản in VNACCS (bước 5 Review): giá trị người khai (dossier-adapter) + Hải quan trả về (customs-adapter) + số ứng dụng ước tính
// cho ô Hải quan còn trống; trạng thái ô (lỗi Hải quan, còn thiếu, ước tính, đã sửa). Bấm ô → panel sửa ô; thanh công cụ: trang, ô cần xử lý, in.
import { Alert, Button, Stack } from "@kb/ui";
import { otherFieldKeys, parseItemFieldCode, printTitle, type Declaration, type DeclarationEditMode, type LineItem, type SubmissionView } from "@kb/contracts";
import { ArrowDown } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { customsItemValues, customsValues } from "../declaration-form/customs-adapter";
import { declarationValues, itemValues } from "../declaration-form/dossier-adapter";
import type { FormValues } from "../declaration-form/form-state";
import { fieldErrors } from "../dossier-detail/steps/customs-errors";
import { FieldEditPanel } from "./field-edit-panel";
import { OTHER_FIELDS_DOM_ID, OtherFields } from "./other-fields";
import { cellDomId, type CellLook } from "./print-cell";
import { regionDomId, PrintSheets } from "./print-sheets";
import {
  attentionCells, cellState, editedKeys, errorSlots, estimateValues, fieldLocator, otherFieldCells, pageCount, panelOrder, printValue, sameNumber,
  type Estimate, type PrintTarget,
} from "./print-state";
import { PrintToolbar } from "./print-toolbar";

type Kind = "IDA" | "EDA";

type Props = {
  dossierId: string;
  decl: Declaration;
  items: LineItem[];
  /** Chế độ sửa theo giai đoạn (panel sửa ô). */
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
  // Thứ tự Tab của panel: ô in, rồi ô "Chỉ tiêu khác" đang áp dụng (ô không áp dụng không hiện nên không nhảy tới).
  const other = otherFieldCells(kind, values, itemRows);
  const otherKeys = otherFieldKeys(kind);
  const order = panelOrder(kind, items.length).filter((t) =>
    t.line === undefined ? !otherKeys.decl.includes(t.key) || other.decl.includes(t.key) : !otherKeys.item.includes(t.key) || Boolean(other.items[t.line]?.includes(t.key)),
  );
  const hasOther = other.decl.length > 0 || other.items.some((k) => k.length > 0);
  return { kind, values, itemRows, errors, attention, look, order, hasOther, directives: info?.directives.length ?? 0 };
}

export function PrintDeclaration({ dossierId, decl, items, mode, canEdit, submission, onAttentionChange }: Props) {
  const [selected, setSelected] = useState<PrintTarget | null>(null);
  // Ổn định qua các lần vẽ: PrintCell (memo) không vẽ lại khi chọn ô khác.
  const select = useCallback((key: string, line?: number) => setSelected(line === undefined ? { key } : { key, line }), []);
  // Cuộn tới ô sau khi vẽ (khối "Chỉ tiêu khác" có thể vừa mở ra); n để cuộn lại cùng ô.
  const [scrollTo, setScrollTo] = useState<{ id: string; n: number } | null>(null);
  useEffect(() => {
    if (scrollTo) document.querySelector(`[data-print-cell="${scrollTo.id}"]`)?.scrollIntoView({ block: "center" });
  }, [scrollTo]);
  const goTo = useCallback((t: PrintTarget | null) => {
    setSelected(t);
    if (t) setScrollTo((s) => ({ id: cellDomId(t.key, t.line), n: (s?.n ?? 0) + 1 }));
  }, []);
  const model = useMemo(() => printModel(decl, items, submission), [decl, items, submission]);
  const attentionCount = model.attention.length;
  useEffect(() => onAttentionChange?.(attentionCount), [attentionCount, onAttentionChange]);

  // Ô cần xử lý kế tiếp sau ô đang chọn (theo thứ tự lỗi → còn thiếu), quay vòng.
  const nextAttention = () => {
    const list = model.attention;
    const i = selected ? list.findIndex((c) => c.key === selected.key && c.line === selected.line) : -1;
    const c = list[(i + 1) % list.length];
    if (c) goTo(c.line === undefined ? { key: c.key } : { key: c.key, line: c.line });
  };

  const scrollToDirectives = () => document.getElementById(regionDomId("chi-thi"))?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <Stack gap="md">
      <PrintToolbar
        pages={pageCount(model.kind, items.length)}
        otherFieldsId={model.hasOther ? OTHER_FIELDS_DOM_ID : null}
        attentionCount={attentionCount}
        onNextAttention={nextAttention}
      />
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
        onSelect={select}
      />
      <OtherFields kind={model.kind} decl={model.values} items={model.itemRows} look={model.look} selected={selected} onSelect={select} />
      <FieldEditPanel
        dossierId={dossierId}
        decl={decl}
        items={items}
        mode={mode}
        canEdit={canEdit}
        values={model.values}
        itemRows={model.itemRows}
        errors={model.errors}
        order={model.order}
        target={selected}
        onTarget={goTo}
      />
    </Stack>
  );
}
