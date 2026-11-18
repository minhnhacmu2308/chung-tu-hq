"use client";
// Tờ khai dạng bản in VNACCS (bước 5 Review): giá trị người khai (dossier-adapter) + Hải quan trả về (customs-adapter) + số ứng dụng ước tính
// cho ô Hải quan còn trống; trạng thái ô (lỗi Hải quan, còn thiếu, ước tính, đã sửa). Bấm ô → panel sửa ô; thanh công cụ: trang, ô cần xử lý, in.
// Lô > 50 dòng (N tờ khai nhánh): thanh chọn tờ ở đầu; dòng hàng, tổng trị giá/thuế, ô 1.2, số Hải quan theo tờ đang chọn; in chỉ tờ đang chọn.
// "Sửa nhanh tại ô" (công tắc trên thanh công cụ, nhớ theo trình duyệt): bấm ô chỉ chọn ô; gõ là nhập ngay trong ô, Enter / nhấp đúp mở panel.
// Các ô sửa nhanh chờ lưu chung (thanh nổi "Lưu N thay đổi", Ctrl+S); đổi tờ / rời tab khi còn ô chưa lưu → hỏi Lưu · Bỏ · Ở lại.
import { Alert, Button, fill, FloatingActionBar, Stack, useMessages, useUiLocale } from "@kb/ui";
import { editBlockFor, otherFieldKeys, parseItemFieldCode, printTitle, type Declaration, type DeclarationBranch, type DeclarationEditMode, type DeclarationEditScope, type LineItem, type SubmissionView } from "@kb/contracts";
import { ArrowDown, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FieldEditPanel, type LeaveGuard } from "./field-edit-panel";
import { canEditInline, draftId, inlineEdits, inlineInputOf, inlineStartText, parseInline } from "./inline-edit";
import { InlineEditContext, InlineEditStore, useDraftCount, type InlineEditApi } from "./inline-edit-store";
import { panelShortcut } from "./panel-keys";
import { UnsavedDialog } from "./unsaved-dialog";
import { declarationValues } from "../declaration-form/dossier-adapter";
import { useSaveDeclarationEdits } from "../declaration-form/use-save-edits";
import { OTHER_FIELDS_DOM_ID, OtherFields } from "./other-fields";
import { cellDomId, type CellLook } from "./print-cell";
import { regionDomId, PrintSheets } from "./print-sheets";
import {
  cellState, customsAnswered, editedKeys, errorSlots, fieldLocator, LOOKUP_NAME_CELLS, otherFieldCells, pageCount, panelOrder, hiddenUntilCustoms, printData, printedRaw, printIssues, printValue,
  printedKeyTarget, printStateFor, sameNumber, sheetIssueCounts, withLookupNames, withOriginNames, type PrintData, type PrintTarget,
} from "./print-state";
import { codeScope } from "../declaration-form/code-scope";
import { useCodeList, useCodeName } from "../declaration-form/use-code-list";
import { PrintToolbar } from "./print-toolbar";
import { SharedFieldsNote, SheetPicker } from "./sheet-picker";
import { PRINT_MESSAGES } from "./print.messages";
import { formatDateTime, formatNumber } from "@/lib/format";
import { errorPlace } from "../dossier-detail/steps/customs-errors";

type Kind = "IDA" | "EDA";

type Props = {
  dossierId: string;
  decl: Declaration;
  items: LineItem[];
  /** Chế độ sửa theo giai đoạn (panel sửa ô). */
  mode: DeclarationEditMode;
  /** Phạm vi sửa theo tờ đã gọi về (lô nhiều tờ): dòng của tờ chưa gọi về chỉ đọc; không truyền → `mode` cho mọi ô. */
  scope?: DeclarationEditScope;
  canEdit: boolean;
  submission: SubmissionView | undefined;
  /** Tổng theo tờ khai nhánh (DeclarationView.branches); [] / không có → một tờ. */
  branches?: DeclarationBranch[];
  /** Tờ đang chọn (1-based) do nơi gọi giữ (vd tham số URL); không truyền → giữ trong component. */
  sheet?: number;
  onSheetChange?: (no: number) => void;
  /**
   * Nơi gọi (review-step) hỏi trước khi rời tab "Tờ khai": gọi `current(href)` → true = panel còn thay đổi chưa lưu, đã mở hộp
   * Lưu / Giữ giá trị cũ / Ở lại và sẽ tự chuyển tới `href` khi người dùng chọn Lưu hoặc Giữ giá trị cũ; false = rời được ngay.
   */
  leaveGuard?: LeaveGuard;
};

const slotId = (key: string, line?: number) => `${line ?? ""}:${key}`;
/** localStorage: "1" = bật sửa nhanh tại ô trên bản in (nhớ theo trình duyệt). */
const QUICK_EDIT_KEY = "kb-print-quick-edit";
/** Khung liệt kê lỗi Hải quan không gắn được vào ô ("Chỉ ô cần xử lý" cuộn tới khi không còn ô). */
const UNPLACED_DOM_ID = "print-unplaced-errors";

function printModel(data: PrintData, decl: Declaration, items: LineItem[], submission: SubmissionView | undefined, mode: DeclarationEditMode, canEdit: boolean, lineMode: DeclarationEditMode) {
  const { kind, values, itemRows, printRows, checks, errors, lineNos, customs, estimate, estimated, itemEstimated } = data;
  const info = submission?.customsInfo ?? null;

  const errorIds = new Set(errorSlots(kind, errors, lineNos).map((s) => slotId(s.key, s.line)));
  // Cùng hàm với huy hiệu tab ở review-step: chỉ đọc → không có ô "còn thiếu".
  const issues = printIssues(data, mode, canEdit, lineMode);
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
    const raw = (line === undefined ? printedRaw(kind, key, values) : printRows[line]?.[key]) ?? "";
    const state = cellState({
      error: errorIds.has(id),
      missing: missingIds.has(id),
      check: line !== undefined && Boolean(checks[line]?.has(key)),
      estimated: line === undefined ? estimated.has(key) : Boolean(itemEstimated?.[line]?.has(key)),
      // Ô in dồn → khóa lưu của dòng nhóm (người khai sửa lưu ở khóa lưu).
      edited: line === undefined ? editedDecl.has(key) : Boolean(editedItem[line]?.has(printedKeyTarget(itemRows[line] ?? {}, key).key)),
    });
    return { raw, state, compareTo: line === undefined ? compareTo(key) : null };
  };
  // Hải quan chưa trả kết quả: ô Hải quan trả về còn trống không hiện (chưa có gì để xem) – Tab cũng bỏ qua.
  const hidden = customsAnswered(submission) ? undefined : (key: string, line?: number) => hiddenUntilCustoms(kind, key, look(key, line).raw);
  // Thứ tự Tab của panel: ô in, rồi ô "Chỉ tiêu khác" đang áp dụng (ô không áp dụng không hiện nên không nhảy tới).
  const other = otherFieldCells(kind, values, itemRows);
  const otherKeys = otherFieldKeys(kind);
  const order = panelOrder(kind, items.length).filter((t) => !hidden?.(t.key, t.line) && (
    t.line === undefined ? !otherKeys.decl.includes(t.key) || other.decl.includes(t.key) : !otherKeys.item.includes(t.key) || Boolean(other.items[t.line]?.includes(t.key))),
  );
  const hasOther = other.decl.length > 0 || other.items.some((k) => k.length > 0);
  return { kind, hidden, lineNos, values, itemRows, errors, attention, unplaced: issues.unplaced, issueCount: issues.count, look, order, hasOther, directives: info?.directives.length ?? 0 };
}

export function PrintDeclaration({ dossierId, decl, items: allItems, mode, scope: editScope, canEdit, submission: lotSubmission, branches, sheet, onSheetChange, leaveGuard }: Props) {
  const t = useMessages(PRINT_MESSAGES);
  const locale = useUiLocale();
  const [ownSheet, setOwnSheet] = useState(1);
  const view = useMemo(() => printStateFor({ items: allItems, ...(branches ? { branches } : {}) }, sheet ?? ownSheet, lotSubmission), [allItems, branches, sheet, ownSheet, lotSubmission]);
  const { items, submission } = view;
  // Việc cần xử lý riêng của từng tờ (lỗi Hải quan của nhánh, ô dòng hàng) – huy hiệu trên thanh chọn tờ; lô 1 tờ không cần.
  const sheetIssues = useMemo(
    () => (view.of > 1 ? sheetIssueCounts(decl, allItems, branches, lotSubmission, mode, canEdit, editScope?.lines).sheets : undefined),
    [view.of, decl, allItems, branches, lotSubmission, mode, canEdit, editScope],
  );
  const [selected, setSelected] = useState<PrintTarget | null>(null);
  // Đổi tờ: ô đang chọn (chỉ số dòng của tờ cũ) không còn đúng → bỏ chọn; panel vẽ lại theo tờ mới (key).
  const [seenSheet, setSeenSheet] = useState(view.no);
  if (seenSheet !== view.no) {
    setSeenSheet(view.no);
    setSelected(null);
  }
  // Ổn định qua các lần vẽ: PrintCell (memo) không vẽ lại khi chọn ô khác.
  const select = useCallback((key: string, line?: number) => setSelected(line === undefined ? { key } : { key, line }), []);
  // Cuộn tới ô sau khi vẽ (khối "Chỉ tiêu khác" có thể vừa mở ra); n để cuộn lại cùng ô.
  const [scrollTo, setScrollTo] = useState<{ id: string; n: number } | null>(null);
  const quickRef = useRef(false);
  useEffect(() => {
    if (!scrollTo) return;
    const el = document.querySelector<HTMLElement>(`[data-print-cell="${scrollTo.id}"]`);
    el?.scrollIntoView({ block: "center" });
    // Sửa nhanh (không có panel giữ focus): focus luôn ô vừa nhảy tới để gõ được ngay.
    if (quickRef.current) el?.focus({ preventScroll: true });
  }, [scrollTo]);
  const goTo = useCallback((t: PrintTarget | null) => {
    setSelected(t);
    if (t) setScrollTo((s) => ({ id: cellDomId(t.key, t.line), n: (s?.n ?? 0) + 1 }));
  }, []);
  const base = useMemo(() => printData(decl, items, submission, view), [decl, items, submission, view]);
  // Tên địa điểm lưu kho: Hải quan trả theo mã; trước đó tra danh mục A202 (trong phạm vi chi cục) để hiện ước tính.
  const storage = LOOKUP_NAME_CELLS[base.kind][0]!;
  const office = base.values["TK_CH"] ?? "";
  const scope = useMemo(() => codeScope("A202", storage.code, base.kind, { TK_CH: office }, "vi"), [storage.code, base.kind, office]);
  const storageName = useCodeName("A202", base.values[storage.code] ?? "", scope);
  // Tên nơi xuất xứ (IDA): Hải quan chưa trả → tên VNACCS theo danh mục nước (ước tính).
  const countries = useCodeList(base.kind === "IDA" ? "COUNTRY" : undefined);
  const data = useMemo(() => withOriginNames(withLookupNames(base, { [storage.name]: storageName }), countries), [base, storage.name, storageName, countries]);
  // Lô nhiều tờ: tờ đang xem chưa gọi về / đã thông quan → dòng hàng chỉ đọc, nói rõ trên trang.
  const block = editScope && view.of > 1 && canEdit && editScope.lines[view.no] === "LOCKED" ? editBlockFor(editScope, { kind: "LINE", sheet: view.no }) : null;
  const lineBlock = block?.reasonCode === "LINE_SHEET_LOCKED" || block?.reasonCode === "LINE_SHEET_CLOSED" ? block : null;
  const lineMode: DeclarationEditMode = editScope ? editScope.lines[view.no] ?? editScope.common : mode;
  const model = useMemo(() => printModel(data, decl, items, submission, mode, canEdit, lineMode), [data, decl, items, submission, mode, canEdit, lineMode]);
  // Cùng số với huy hiệu tab: ô cần xử lý + lỗi Hải quan không gắn được vào ô.
  const attentionCount = model.issueCount;

  // ── Sửa nhanh tại ô ──
  const router = useRouter();
  const save = useSaveDeclarationEdits(dossierId);
  const [quickPref, setQuickPref] = useState(false);
  useEffect(() => setQuickPref(window.localStorage.getItem(QUICK_EDIT_KEY) === "1"), []);
  // Chỉ khi có ô sửa được: chưa khai hoặc khai sửa đổi (ô chung hoặc dòng hàng của tờ đang xem).
  const quickAvailable = canEdit && (mode !== "LOCKED" || lineMode !== "LOCKED");
  const quick = quickPref && quickAvailable;
  quickRef.current = quick;
  const [store] = useState(() => new InlineEditStore());
  const drafts = useDraftCount(store);
  const original = useMemo(() => declarationValues(decl.kind, decl.fields), [decl.kind, decl.fields]);
  // Panel khi sửa nhanh chỉ mở bằng Enter / nhấp đúp (bấm ô chỉ chọn ô); tắt sửa nhanh → panel theo ô đang chọn như cũ.
  const [panelTarget, setPanelTarget] = useState<PrintTarget | null>(null);
  const [confirm, setConfirm] = useState<{ sheet?: number; href?: string } | null>(null);
  /** Hộp hỏi đóng vì "Ở lại" → trả focus về ô đang chọn (lưu / bỏ thì trang tự chuyển tiếp). */
  const stayed = useRef(false);
  const latest = useRef({ model, decl, items, mode, lineMode, original, locale });
  latest.current = { model, decl, items, mode, lineMode, original, locale };

  const focusCell = useCallback((key: string, line?: number) => {
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-print-cell="${cellDomId(key, line)}"]`)?.focus());
  }, []);
  /** Lưu các ô sửa nhanh (một lần cho mọi ô, mỗi chỉ tiêu ghi field_audit như panel); xong → `then`. */
  const saveDrafts = useCallback((then?: () => void) => {
    const r = latest.current;
    const edits = inlineEdits(r.decl.kind, store.list(), { fields: r.decl.fields, mode: r.mode, original: r.original, items: r.items, itemRows: r.model.itemRows });
    if (edits.length === 0) {
      store.clear();
      then?.();
      return;
    }
    save.mutate(edits, { onSuccess: () => { store.clear(); then?.(); } });
  }, [store, save]);
  const inline = useMemo<InlineEditApi>(() => {
    const savedRaw = (key: string, line?: number) => {
      const r = latest.current.model;
      return (line === undefined ? r.values[key] : r.itemRows[line]?.[key]) ?? "";
    };
    const canEditCell = (key: string, line?: number) => {
      const r = latest.current;
      const declDrafts = Object.fromEntries(store.list().filter((d) => d.line === undefined).map((d) => [d.key, d.value]));
      return canEditInline(r.decl.kind, key, line, { fields: r.decl.fields, mode: r.mode, lineMode: r.lineMode, original: r.original, values: { ...r.model.values, ...declDrafts }, locale: r.locale });
    };
    const openPanel = (key: string, line?: number) => {
      const target = line === undefined ? { key } : { key, line };
      // Còn ô sửa nhanh chưa lưu → lưu trước rồi mở panel (panel đọc giá trị đã lưu – không để hai nơi giữ hai giá trị khác nhau).
      const open = () => { setSelected(target); setPanelTarget(target); };
      if (store.count() > 0) saveDrafts(open);
      else open();
    };
    return {
      store,
      canEdit: canEditCell,
      start: (key, line, text) => {
        const input = inlineInputOf(latest.current.decl.kind, key);
        if (!input) return;
        setSelected(line === undefined ? { key } : { key, line });
        store.startEdit(draftId(key, line), text ?? inlineStartText(input, store.draftOf(draftId(key, line)) ?? savedRaw(key, line)));
      },
      commit: (key, line, text, move) => {
        const input = inlineInputOf(latest.current.decl.kind, key);
        if (!input) return false;
        const parsed = parseInline(input, text);
        if (!parsed.ok) return false;
        store.setDraft(line === undefined ? { key, value: parsed.value } : { key, line, value: parsed.value }, savedRaw(key, line));
        store.stopEdit();
        // Tab / Shift+Tab: sang ô kế tiếp / trước theo thứ tự của panel; không còn ô → ở lại.
        const order = latest.current.model.order;
        const at = order.findIndex((o) => o.key === key && o.line === line);
        const next = move !== 0 && at >= 0 ? order[at + move] : undefined;
        const to = next ?? (line === undefined ? { key } : { key, line });
        setSelected(to);
        focusCell(to.key, to.line);
        return true;
      },
      cancel: (key, line) => {
        store.stopEdit();
        focusCell(key, line);
      },
      reject: (key, line, text) => store.reject(draftId(key, line), text),
      clearCell: (key, line) => store.setDraft(line === undefined ? { key, value: "" } : { key, line, value: "" }, savedRaw(key, line)),
      openPanel,
    };
  }, [store, saveDrafts, focusCell]);

  const toggleQuick = (on: boolean) => {
    setQuickPref(on);
    window.localStorage.setItem(QUICK_EDIT_KEY, on ? "1" : "0");
    setPanelTarget(null);
    if (!on) store.stopEdit();
  };
  // Ctrl+S (⌘S) khi còn ô sửa nhanh chưa lưu và panel đang đóng: chốt ô đang gõ (mất focus) rồi lưu tất cả.
  useEffect(() => {
    if (!quick || drafts === 0 || panelTarget) return;
    const onKey = (e: KeyboardEvent) => {
      if (panelShortcut(e) !== "SAVE") return;
      e.preventDefault();
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      if (!save.isPending) saveDrafts();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [quick, drafts, panelTarget, save.isPending, saveDrafts]);
  // Đóng / tải lại trang khi còn ô chưa lưu → trình duyệt hỏi.
  useEffect(() => {
    if (drafts === 0) return;
    const onUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [drafts]);
  // Rời tab "Tờ khai": panel còn thay đổi → panel hỏi; còn ô sửa nhanh chưa lưu → hỏi Lưu · Bỏ · Ở lại rồi mới chuyển.
  const panelGuard = useRef<((href: string) => boolean) | null>(null);
  useEffect(() => {
    if (!leaveGuard) return;
    leaveGuard.current = (href) => {
      if (panelGuard.current?.(href)) return true;
      if (save.isPending) return true;
      if (store.count() === 0) return false;
      setConfirm({ href });
      return true;
    };
    return () => { leaveGuard.current = null; };
  });
  // Đổi tờ (lô nhiều tờ): ô sửa nhanh gắn theo dòng của tờ đang xem → hỏi trước khi đổi.
  const changeSheet = (no: number) => {
    if (store.count() > 0) setConfirm({ sheet: no });
    else (onSheetChange ?? setOwnSheet)(no);
  };
  const proceed = (c: { sheet?: number; href?: string }) => {
    setConfirm(null);
    if (c.sheet !== undefined) (onSheetChange ?? setOwnSheet)(c.sheet);
    if (c.href) router.replace(c.href, { scroll: false });
  };

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
          <Alert tone="danger" title={fill(t.rejected, { op: submission.rejection.operation, at: formatDateTime(submission.rejection.at), n: model.unplaced.length })}>
            <ul className="flex flex-col gap-1">
              {model.unplaced.map((e, i) => (
                <li key={i}>
                  <span className="font-medium">{errorPlace(e, locale)}:</span> {e.message}
                  {e.solution ? ` → ${e.solution}` : ""}
                </li>
              ))}
            </ul>
          </Alert>
        </div>
      )}
      <SheetPicker sheets={view.sheets} value={view.no} onChange={changeSheet} {...(sheetIssues ? { issues: sheetIssues } : {})} />
      <PrintToolbar
        pages={pageCount(model.kind, items.length)}
        otherFieldsId={model.hasOther ? OTHER_FIELDS_DOM_ID : null}
        attentionCount={attentionCount}
        onNextAttention={nextAttention}
        {...(quickAvailable ? { quickEdit: { on: quick, onChange: toggleQuick, locked: drafts > 0 } } : {})}
      />
      {quick && <Alert tone="info">{t.quickEditDesc}</Alert>}
      {model.directives > 0 && (
        <Alert
          tone="warning"
          title={fill(t.directives, { n: model.directives })}
          action={
            <Button size="sm" variant="secondary" leftIcon={<ArrowDown className="h-4 w-4" />} onClick={scrollToDirectives}>
              {t.viewDirectives}
            </Button>
          }
        />
      )}
      <SharedFieldsNote of={view.of} />
      {lineBlock && (
        <Alert tone="info">{lineBlock.reasonCode === "LINE_SHEET_CLOSED" ? fill(t.sheetClosed, { sheet: view.no }) : fill(t.sheetNotRecalledNote, { sheet: view.no })}</Alert>
      )}
      <InlineEditContext.Provider value={quick ? inline : null}>
      <PrintSheets
        kind={model.kind}
        title={printTitle(model.kind, submission?.stage)}
        lineNos={model.lineNos}
        look={model.look}
        selected={selected}
        onSelect={select}
        hidden={model.hidden}
      />
      <OtherFields kind={model.kind} decl={model.values} items={model.itemRows} lineNos={model.lineNos} look={model.look} selected={selected} onSelect={select} />
      </InlineEditContext.Provider>
      <FieldEditPanel
        key={view.no}
        dossierId={dossierId}
        decl={decl}
        items={items}
        mode={mode}
        {...(editScope ? { scope: editScope, sheet: view.no } : {})}
        canEdit={canEdit}
        values={model.values}
        itemRows={model.itemRows}
        lineNos={model.lineNos}
        errors={model.errors}
        order={model.order}
        target={quick ? panelTarget : selected}
        onTarget={quick ? (to) => { setPanelTarget(to); if (to) goTo(to); else if (selected) focusCell(selected.key, selected.line); } : goTo}
        leaveGuard={panelGuard}
      />
      {quick && drafts > 0 && (
        <FloatingActionBar placement="top" label={t.quickBar} summary={fill(t.quickPending, { n: formatNumber(drafts) })}>
          <Button size="sm" variant="secondary" disabled={save.isPending} onClick={() => store.clear()}>{t.quickDiscard}</Button>
          <Button size="sm" leftIcon={<Save className="h-4 w-4" />} loading={save.isPending} onClick={() => saveDrafts()}>{fill(t.quickSave, { n: formatNumber(drafts) })}</Button>
        </FloatingActionBar>
      )}
      <UnsavedDialog
        open={confirm !== null}
        title={t.quickTitle}
        count={drafts}
        saving={save.isPending}
        onSave={() => confirm && saveDrafts(() => proceed(confirm))}
        onDiscard={() => { store.clear(); if (confirm) proceed(confirm); }}
        onStay={() => { stayed.current = true; setConfirm(null); }}
        onClosed={() => {
          if (stayed.current && selected) focusCell(selected.key, selected.line);
          stayed.current = false;
        }}
      />
    </Stack>
  );
}
