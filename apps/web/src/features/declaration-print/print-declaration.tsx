"use client";
// Tờ khai dạng bản in VNACCS (bước 5 Review): giá trị người khai (dossier-adapter) + Hải quan trả về (customs-adapter) + số ứng dụng ước tính
// cho ô Hải quan còn trống; trạng thái ô (lỗi Hải quan, còn thiếu, ước tính, đã sửa). Bấm ô → panel sửa ô; thanh công cụ: trang, ô cần xử lý, in.
import { Alert, Button, Stack } from "@kb/ui";
import { otherFieldKeys, parseItemFieldCode, printTitle, type Declaration, type DeclarationEditMode, type LineItem, type SubmissionView } from "@kb/contracts";
import { ArrowDown } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FieldEditPanel, type LeaveGuard } from "./field-edit-panel";
import { OTHER_FIELDS_DOM_ID, OtherFields } from "./other-fields";
import { cellDomId, type CellLook } from "./print-cell";
import { regionDomId, PrintSheets } from "./print-sheets";
import {
  cellState, editedKeys, errorSlots, fieldLocator, otherFieldCells, pageCount, panelOrder, printData, printIssues, printValue, sameNumber,
  type PrintTarget,
} from "./print-state";
import { PrintToolbar } from "./print-toolbar";
import { formatDateTime } from "@/lib/format";
import { errorPlace } from "../dossier-detail/steps/customs-errors";

type Kind = "IDA" | "EDA";

type Props = {
  dossierId: string;
  decl: Declaration;
  items: LineItem[];
  /** Chế độ sửa theo giai đoạn (panel sửa ô). */
  mode: DeclarationEditMode;
  canEdit: boolean;
  submission: SubmissionView | undefined;
  /**
   * Nơi gọi (review-step) hỏi trước khi rời tab "Tờ khai": gọi `current(href)` → true = panel còn thay đổi chưa lưu, đã mở hộp
   * Lưu / Bỏ thay đổi / Ở lại và sẽ tự chuyển tới `href` khi người dùng chọn Lưu hoặc Bỏ; false = rời được ngay.
   */
  leaveGuard?: LeaveGuard;
};

const slotId = (key: string, line?: number) => `${line ?? ""}:${key}`;
/** Khung liệt kê lỗi Hải quan không gắn được vào ô ("Chỉ ô cần xử lý" cuộn tới khi không còn ô). */
const UNPLACED_DOM_ID = "print-unplaced-errors";

function printModel(decl: Declaration, items: LineItem[], submission: SubmissionView | undefined, mode: DeclarationEditMode, canEdit: boolean) {
  const data = printData(decl, items, submission);
  const { kind, values, itemRows, errors, lineNos, customs, estimate, estimated } = data;
  const info = submission?.customsInfo ?? null;

  const errorIds = new Set(errorSlots(kind, errors, lineNos).map((s) => slotId(s.key, s.line)));
  // Cùng hàm với huy hiệu tab ở review-step: chỉ đọc → không có ô "còn thiếu".
  const issues = printIssues(data, mode, canEdit);
  const attention = issues.cells;
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
  return { kind, lineNos, values, itemRows, errors, attention, unplaced: issues.unplaced, issueCount: issues.count, look, order, hasOther, directives: info?.directives.length ?? 0 };
}

export function PrintDeclaration({ dossierId, decl, items, mode, canEdit, submission, leaveGuard }: Props) {
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
  const model = useMemo(() => printModel(decl, items, submission, mode, canEdit), [decl, items, submission, mode, canEdit]);
  // Cùng số với huy hiệu tab: ô cần xử lý + lỗi Hải quan không gắn được vào ô.
  const attentionCount = model.issueCount;

  // Ô cần xử lý kế tiếp sau ô đang chọn (theo thứ tự lỗi → còn thiếu), quay vòng.
  const nextAttention = () => {
    const list = model.attention;
    const i = selected ? list.findIndex((c) => c.key === selected.key && c.line === selected.line) : -1;
    const c = list[(i + 1) % list.length];
    // Chỉ còn lỗi không gắn được vào ô → cuộn tới khung liệt kê lỗi.
    if (!c) document.getElementById(UNPLACED_DOM_ID)?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (c) goTo(c.line === undefined ? { key: c.key } : { key: c.key, line: c.line });
  };

  const scrollToDirectives = () => document.getElementById(regionDomId("chi-thi"))?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <Stack gap="md">
      {model.unplaced.length > 0 && submission?.rejection && (
        <div id={UNPLACED_DOM_ID}>
          <Alert tone="danger" title={`Hải quan từ chối ${submission.rejection.operation} lúc ${formatDateTime(submission.rejection.at)} – ${model.unplaced.length} lỗi không gắn được vào ô`}>
            <ul className="flex flex-col gap-1">
              {model.unplaced.map((e, i) => (
                <li key={i}>
                  <span className="font-medium">{errorPlace(e)}:</span> {e.message}
                  {e.solution ? ` → ${e.solution}` : ""}
                </li>
              ))}
            </ul>
          </Alert>
        </div>
      )}
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
        lineNos={model.lineNos}
        look={model.look}
        selected={selected}
        onSelect={select}
      />
      <OtherFields kind={model.kind} decl={model.values} items={model.itemRows} lineNos={model.lineNos} look={model.look} selected={selected} onSelect={select} />
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
        {...(leaveGuard ? { leaveGuard } : {})}
      />
    </Stack>
  );
}
