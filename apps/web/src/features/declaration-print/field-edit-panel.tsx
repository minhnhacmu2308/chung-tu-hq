"use client";
// Panel sửa ô của bản in (Dialog dạng panel bên phải, không chặn trang): mở khi chọn một ô, hiện cả nhóm ô của chỉ tiêu, lưu bằng API sửa chỉ tiêu.
// `target` = ô người dùng vừa chọn; panel hiện `shown`. Còn thay đổi chưa lưu mà chọn ô khác / đóng / Tab sang ô khác / sang bước OCR
// → hỏi Lưu · Giữ giá trị cũ · Ở lại (Ở lại trả lựa chọn và focus về ô đang sửa). Bấm chuột ra ngoài panel khi còn thay đổi
// → hỏi "Giá trị đã thay đổi, bạn muốn lưu không?" (Lưu · Giữ giá trị cũ), panel vẫn ở ô đang sửa. Đang lưu → chờ lưu xong mới chuyển ô (không hỏi / lưu lặp).
// Enter trong ô nhập (Shift+Enter = xuống dòng; danh sách thả xuống đang mở → Enter chọn mục) → lưu mọi thay đổi của panel rồi hỏi
// Thoát panel · Ở lại. Panel nhiều ô: Tab qua lại giữa các ô, nhập xong hết mới Enter.
// Ctrl+S / Ctrl+Enter → lưu như Enter (ô đang gõ dở được chốt trước). Esc trên ô đã sửa → trả ô về giá trị cũ (lần nữa → đóng panel như thường).
// F1 / nút "Phím tắt" → bảng phím tắt (panel-keys.ts).
// Tab trong ô nhập → ô nhập kế tiếp của panel (bỏ qua nút TH / hướng dẫn). Tab ở phần tử cuối / Shift+Tab ở phần tử đầu → ô kế tiếp / trước theo `order`, bỏ qua các ô cùng nhóm (panel đã hiện cả nhóm).
import { Alert, Button, Checkbox, Dialog, DialogContent, DialogFooter, fill, useMessages, useUiLocale } from "@kb/ui";
import {
  editBlockFor, fieldRole, fixedPlaceCode, formKeysOf, isDeclarationFieldEditable, itemFieldCode, sequenceBlocker, transportPlaceChanges, type AmendLock, type Declaration, type DeclarationEditMode, type DeclarationEditScope, type LineItem,
} from "@kb/contracts";
import { CheckCircle2, CopyCheck, Keyboard, PenLine, Save } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { formatNumber } from "@/lib/format";
import { ChangeHsDialog } from "../dossier-detail/steps/agent-step";
import { errorsForField, type FieldError } from "../dossier-detail/steps/customs-errors";
import { declarationLockOf, declarationValues, editableKeys, pendingEdits, pendingItemEdits } from "../declaration-form/dossier-adapter";
import { RoleMark } from "../declaration-form/field";
import { fieldTitle } from "../declaration-form/display";
import type { FormValues } from "../declaration-form/form-state";
import { useSaveDeclarationEdits } from "../declaration-form/use-save-edits";
import { useCodeName, usePlaceNameLookup } from "../declaration-form/use-code-list";
import { QtySuggestionHint } from "../declaration-form/qty-hint";
import { PanelDetails } from "./panel-details";
import { panelShortcut, revertField } from "./panel-keys";
import { applyToOtherLines, fieldLocator, nextTarget, taxCodeKeys, type PrintTarget } from "./print-state";
import { SavedDialog } from "./saved-dialog";
import { ShortcutsDialog } from "./shortcuts-dialog";
import { UnsavedDialog } from "./unsaved-dialog";
import { PRINT_MESSAGES } from "./print.messages";

/** Hỏi trước khi rời bản in (đổi tab): true = còn thay đổi chưa lưu, đã mở hộp hỏi (Lưu / Bỏ → chuyển tới href); false = rời ngay. */
export type LeaveGuard = RefObject<((href: string) => boolean) | null>;

type Props = {
  dossierId: string;
  decl: Declaration;
  items: LineItem[];
  /** Chế độ sửa chỉ tiêu chung (ô tờ khai); ô dòng hàng theo `scope` của tờ `sheet` khi có. */
  mode: DeclarationEditMode;
  /** Phạm vi sửa theo tờ đã gọi về (lô nhiều tờ); không truyền → `mode` cho mọi ô. */
  scope?: DeclarationEditScope;
  /** Tờ đang hiện (1-based) – tờ chứa các dòng của panel. */
  sheet?: number;
  canEdit: boolean;
  /** Giá trị đang hiện trên bản in: tờ khai (người khai + Hải quan + ước tính) và từng dòng hàng. */
  values: FormValues;
  itemRows: FormValues[];
  /** Số dòng in trên bản in theo thứ tự `items` (tờ khai nhánh: 1..50 theo tờ) – lỗi Hải quan của dòng ghi theo số này; không có → lineNo. */
  lineNos?: number[];
  errors: FieldError[];
  /** Thứ tự Tab giữa các ô (panelOrder, bỏ ô "Chỉ tiêu khác" không áp dụng). */
  order: PrintTarget[];
  target: PrintTarget | null;
  onTarget: (t: PrintTarget | null) => void;
  leaveGuard?: LeaveGuard;
};

const tid = (t: PrintTarget | null) => (t ? `${t.line ?? ""}:${t.key}` : "");
/** Ô nhập của panel cho Tab: chữ / số / ngày, ô chọn (Select · Combobox – role combobox); bỏ thẻ select ẩn của Select (tabindex -1). */
const FIELDS = ":is(input, textarea, [role=combobox]):not([disabled]):not([tabindex='-1']):not([type=hidden])";
const FOCUSABLE = "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])";

/** Ô số lượng của dòng hàng (1.83/1.84 IDA, 2.72/2.73 EDA) – nơi hiện gợi ý quy đổi theo ĐVT khai. */
const QTY_KEYS = new Set(["HAG_QN1", "HAG_QT1", "HAG_QN2", "HAG_QT2"]);

export function FieldEditPanel({ dossierId, decl, items, mode: stageMode, scope, sheet = 1, canEdit, values, itemRows, lineNos, errors, order, target, onTarget, leaveGuard }: Props) {
  const t = useMessages(PRINT_MESSAGES);
  const locale = useUiLocale();
  const kind = decl.kind;
  const save = useSaveDeclarationEdits(dossierId);
  const router = useRouter();
  const pathname = usePathname();
  const original = useMemo(() => declarationValues(kind, decl.fields), [kind, decl.fields]);

  const [shown, setShown] = useState<PrintTarget | null>(target);
  // Ô dòng hàng theo tờ đang hiện (tờ chưa gọi về khóa), ô chung theo chỉ tiêu chung; lý do khóa theo cùng quy tắc với backend (editBlockFor).
  const onLine = shown?.line !== undefined;
  const mode: DeclarationEditMode = !canEdit ? "LOCKED" : onLine && scope ? scope.lines[sheet] ?? scope.common : stageMode;
  const block = scope ? editBlockFor(scope, onLine ? { kind: "LINE", sheet } : { kind: "COMMON" }) : null;
  const lockedText =
    block?.reasonCode === "COMMON_LOCKED_SHEETS" ? fill(t.commonLocked, { sheets: String(block.params.sheets) })
    : block?.reasonCode === "LINE_SHEET_LOCKED" ? fill(t.sheetNotRecalled, { sheet })
    : block?.reasonCode === "LINE_SHEET_CLOSED" ? fill(t.sheetClosed, { sheet })
    : t.lockedReason;
  const readOnlyReason = !canEdit ? t.noPermission : mode === "LOCKED" ? lockedText : null;
  const editable = useMemo(() => editableKeys(kind, decl.fields, mode), [kind, decl.fields, mode]);
  const baseLockOf = useMemo(() => declarationLockOf(kind, mode, original, editable, locale), [kind, mode, original, editable, locale]);
  const [changes, setChanges] = useState<FormValues>({});
  // Ô nhập theo thứ tự (2.59 mã 1–5, 2.60 số container 1–50): ô trước còn trống → khóa, xét theo giá trị đang sửa (nhập ô 1 là mở ô 2 ngay).
  const lockOf = useCallback((key: string): AmendLock | null => {
    const base = baseLockOf(key);
    if (base) return base;
    if (shown?.line !== undefined) return null;
    const current = { ...values, ...changes };
    // PTVC 9 (khác / tại chỗ): mã địa điểm xếp / dỡ cố định VNZZZ – không sửa.
    const fixed = fixedPlaceCode(kind, key, current);
    if (fixed) return { basis: "SOFTWARE", reason: fill(t.onSiteFixed, { code: fixed }) };
    const prev = sequenceBlocker(kind, key, current);
    return prev ? { basis: "SOFTWARE", reason: fill(t.fillPrevFirst, { n: prev.position }) } : null;
  }, [baseLockOf, kind, values, changes, shown?.line, t.fillPrevFirst, t.onSiteFixed]);
  // Đổi một ô: áp quy tắc địa điểm theo PTVC (đổi PTVC sang / khỏi 9 → mã xếp / dỡ VNZZZ / bỏ VNZZZ; tên khi PTVC 9 → in hoa không dấu).
  // Đổi mã địa điểm xếp / dỡ (không phải PTVC 9 / mã …ZZZ) → tên theo danh mục A016 của mã mới.
  const placeName = usePlaceNameLookup();
  // Ô bị quy tắc tự đổi theo ô khác (ô bị đổi → ô gây ra) – Esc trên ô gây ra trả cả các ô này về giá trị cũ; người dùng tự sửa ô thì bỏ khỏi đây.
  const derivedFrom = useRef(new Map<string, string>());
  const change = useCallback((key: string, value: string) => {
    setChanges((c) => {
      const out = shown?.line === undefined ? transportPlaceChanges(kind, { ...values, ...c }, key, value, placeName) : { [key]: value };
      for (const k of Object.keys(out)) if (k === key) derivedFrom.current.delete(k); else derivedFrom.current.set(k, key);
      return { ...c, ...out };
    });
  }, [kind, values, shown?.line, placeName]);
  // 2.59: tên địa điểm xếp hàng lên xe tự điền theo mã 1 (danh mục A202) khi tên đang trống hoặc là tên tự điền theo mã cũ – người khai sửa được.
  const vanningCode = kind === "EDA" ? (changes["CON_VC1"] ?? values["CON_VC1"] ?? "") : "";
  const vanningName = useCodeName("A202", vanningCode, null);
  const savedVanningName = useCodeName("A202", kind === "EDA" ? values["CON_VC1"] ?? "" : "", null);
  const autoName = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (changes["CON_VC1"] === undefined || !vanningName) return;
    setChanges((c) => {
      const current = (c["CON_VN"] ?? values["CON_VN"] ?? "").trim();
      if (current && current !== autoName.current && current !== savedVanningName) return c;
      autoName.current = vanningName;
      derivedFrom.current.set("CON_VN", "CON_VC1");
      return current === vanningName ? c : { ...c, CON_VN: vanningName };
    });
  }, [changes, vanningName, savedVanningName, values]);
  const [confirm, setConfirm] = useState<{ next: PrintTarget | null; href?: string; leaving?: boolean } | null>(null);
  const [hsItem, setHsItem] = useState<LineItem | null>(null);
  // Vừa lưu bằng Enter → hỏi Thoát panel · Ở lại.
  const [saved, setSaved] = useState(false);
  // Mã thuế của dòng hàng: mặc định áp cho mọi dòng khác của tờ (bỏ chọn → chỉ dòng đang sửa, các dòng khác sửa tay từng dòng).
  const [applyAll, setApplyAll] = useState(true);
  const [help, setHelp] = useState(false);

  const spot = shown ? fieldLocator(kind).get(shown.key) : undefined;
  const line = shown?.line;
  const item = line === undefined ? undefined : items[line];
  const row = line === undefined ? undefined : itemRows[line];
  const edits = !spot || readOnlyReason ? []
    : line === undefined ? pendingEdits(kind, original, { ...original, ...changes }, editable)
    : item && row ? pendingItemEdits(kind, [item.id], [row], [{ ...row, ...changes }]) : [];
  const dirty = edits.length > 0;
  const taxKeys = !spot || readOnlyReason || !item || !row ? [] : spot.group.map((f) => f.key).filter((k) => taxCodeKeys(kind).has(k) && !lockOf(k));
  const spread = taxKeys.length > 0 && line !== undefined && row ? applyToOtherLines(items, itemRows, line, { ...row, ...changes }, taxKeys) : { edits: [], lines: 0 };
  const bulk = applyAll ? spread.edits : [];
  // Chỉ tiêu bị đánh dấu cần kiểm tra trong nhóm ô đang hiện (chỉ tiêu sửa tay được): "Xác nhận đúng" lưu lại đúng giá trị đang có
  // → backend bỏ cờ nghi ngờ, ghi field_audit như một lần sửa. Lưu thay đổi cũng xác nhận luôn các chỉ tiêu bị đánh dấu còn lại của nhóm.
  const suspects = !spot || readOnlyReason ? [] : decl.fields.filter((f) =>
    f.suspect && isDeclarationFieldEditable(f.code) && spot.group.some((g) => (item ? itemFieldCode(item.id, g.key) === f.code : formKeysOf(kind, f.code).includes(g.key))));
  const confirmations = suspects.filter((f) => !edits.some((e) => e.code === f.code)).map((f) => ({ code: f.code, value: f.value }));
  const notes = [...new Set(suspects.flatMap((f) => (f.note ? [f.note] : [])))];
  // PTVC 9 mà mã xếp / dỡ đang lưu khác VNZZZ (dữ liệu cũ): panel của chỉ tiêu tự sửa thành VNZZZ (người khai bấm Lưu).
  const fixPlaces = !spot || readOnlyReason || line !== undefined ? [] : spot.group.flatMap((g) => {
    const fixed = fixedPlaceCode(kind, g.key, { ...values, ...changes });
    return fixed && (changes[g.key] ?? values[g.key] ?? "") !== fixed ? [[g.key, fixed] as const] : [];
  });
  useEffect(() => {
    if (fixPlaces.length) setChanges((c) => ({ ...c, ...Object.fromEntries(fixPlaces) }));
  });

  const field = spot?.field;
  const no = field ? field.no ?? spot.parentNo : undefined;
  // Ô con của nhóm (1.29 Mã / Tên, 1.33 Mã / Tên…): panel hiện cả nhóm → tiêu đề theo tên nhóm.
  const title = field ? fieldTitle(no, field.no ? field.label : spot.groupLabel ?? field.label) : "";
  // Lưu / xác nhận xong → đóng panel, người dùng quay lại bản in (khỏi phải bấm Đóng).
  const commit = () => save.mutate([...edits, ...confirmations, ...bulk], { onSuccess: () => { setChanges({}); onTarget(null); } });

  // Ô được chọn đổi (bấm ô, Tab, đóng, "Chỉ ô cần xử lý"): chưa lưu → hỏi; không thì chuyển ngay.
  // Đang lưu → chưa xét (giữ `seen`): lưu xong vẽ lại, phần sửa đã xóa → chuyển ngay; lưu lỗi → còn thay đổi → hỏi.
  const [seen, setSeen] = useState(target);
  if (tid(seen) !== tid(target) && !save.isPending) {
    setSeen(target);
    // Ô khác cùng nhóm, cùng dòng: panel đang hiện đúng các ô đó → giữ phần đang sửa, chỉ đổi ô được chọn.
    const sameGroup = Boolean(target && shown && target.line === shown.line && spot?.group.some((f) => f.key === target.key));
    if (tid(target) !== tid(shown)) {
      if (sameGroup) setShown(target);
      else if (dirty) setConfirm({ next: target });
      else {
        setShown(target);
        setChanges({});
      }
    }
  }
  // Dữ liệu tờ khai đổi (sau khi lưu, tải lại) → bỏ phần đang sửa, hiện theo dữ liệu mới.
  const dataKey = useMemo(() => JSON.stringify([decl.fields, items]), [decl.fields, items]);
  const [seenData, setSeenData] = useState(dataKey);
  if (seenData !== dataKey) {
    setSeenData(dataKey);
    setChanges({});
  }

  // Chuyển ô → focus ô nhập của đúng ô được chọn trong nhóm; ô đó chỉ đọc → ô nhập đầu tiên của nhóm.
  const body = useRef<HTMLDivElement>(null);
  const lastFocus = useRef<HTMLElement | null>(null);
  const shownKey = shown?.key;
  const focusField = useCallback((key: string | undefined) => {
    const root = body.current;
    const own = key ? root?.querySelector<HTMLElement>(`[data-panel-field="${key}"] ${FIELDS}`) : null;
    (own ?? root?.querySelector<HTMLElement>(FIELDS))?.focus();
  }, []);
  const shownId = tid(shown);
  // Ô nhập có thể hiện muộn hoặc dựng lại (danh mục mã tải xong → ô chọn mới) làm mất focus → trong 2 giây đầu, focus "lạc"
  // (body / ô vừa bấm trên bản in) thì đặt lại; người dùng tự focus chỗ khác thì thôi.
  useEffect(() => {
    if (!shownId) return;
    focusField(shownKey);
    const start = document.activeElement;
    let tries = 0;
    const timer = window.setInterval(() => {
      const active = document.activeElement;
      const inside = Boolean(active && body.current?.contains(active));
      // Người dùng tự focus chỗ khác (ngoài panel, không phải ô vừa bấm) hoặc hết 2 giây → thôi.
      if ((!inside && active && active !== document.body && active !== start) || ++tries > 20) {
        window.clearInterval(timer);
        return;
      }
      if (!inside) focusField(shownKey);
    }, 100);
    return () => window.clearInterval(timer);
  }, [shownId, shownKey, focusField]);
  /** Đóng hộp hỏi: focus lại ô đang focus trước đó trong panel (còn trên trang), không thì ô đang chọn. */
  // Chỉ khi chọn "Ở lại" (hoặc lưu lỗi): Lưu / Giữ giá trị cũ đã chuyển ô – focus do effect chuyển ô đặt, không kéo về ô cũ.
  const stayed = useRef(false);
  const restoreFocus = () => {
    if (!stayed.current) return;
    stayed.current = false;
    const el = lastFocus.current;
    if (el?.isConnected && body.current?.contains(el)) el.focus();
    else focusField(shownKey);
  };

  const proceed = (next: PrintTarget | null, href?: string) => {
    stayed.current = false;
    setConfirm(null);
    setChanges({});
    setShown(next);
    if (href) router.replace(href, { scroll: false });
  };
  const stay = () => {
    stayed.current = true;
    setConfirm(null);
    if (tid(target) !== tid(shown)) onTarget(shown);
  };
  // Rời tab "Tờ khai" (panel sẽ bị gỡ): còn thay đổi chưa lưu → hỏi như khi chọn ô khác; đang lưu → chặn (chờ lưu xong).
  useEffect(() => {
    if (!leaveGuard) return;
    leaveGuard.current = (href) => {
      if (save.isPending) return true;
      if (!dirty) return false;
      // Giữ ô đang chọn: rời trang thì panel bị gỡ; ở lại trang (mở hộp phê duyệt) thì panel vẫn đúng ô đang chọn.
      setConfirm({ next: shown, href });
      return true;
    };
    return () => { leaveGuard.current = null; };
  });
  // Bấm chuột ra ngoài panel (trang phía sau, thanh menu…) khi còn thay đổi chưa lưu → hỏi lưu hay giữ giá trị cũ.
  // Hỏi sau khi cú bấm xử lý xong: bấm vào ô khác của bản in đã mở hộp hỏi kèm ô mới (giữ hộp đó). Đang lưu / đang có hộp khác → bỏ qua.
  const leaveState = useRef({ dirty, busy: false, shown });
  useEffect(() => {
    leaveState.current = { dirty, busy: save.isPending || confirm !== null || hsItem !== null || saved || help, shown };
  });
  // Ctrl+S / Ctrl+Enter / F1 khi panel đang mở (focus ở panel hay ở bản in phía sau): chặn mặc định của trình duyệt (lưu trang, trợ giúp).
  // Lưu: rời ô đang focus trước (ô ngày chốt phần đang gõ khi mất focus) rồi lưu; không có gì để lưu → focus lại ô đó. Đang có hộp khác → bỏ qua.
  const open = Boolean(shown && spot);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      const action = panelShortcut(e);
      if (!action) return;
      e.preventDefault();
      if (leaveState.current.busy) return;
      if (action === "HELP") {
        setHelp(true);
        return;
      }
      const el = document.activeElement instanceof HTMLElement && body.current?.contains(document.activeElement) ? document.activeElement : null;
      el?.blur();
      window.setTimeout(() => {
        if (!enterSave.current() && el?.isConnected) el.focus();
      }, 0);
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open]);
  // Esc trên ô đã sửa → trả ô về giá trị cũ, panel vẫn mở. Ô chưa sửa → để Radix đóng panel (còn thay đổi ở ô khác → hỏi như khi đóng).
  const onEscapeKeyDown = (e: globalThis.KeyboardEvent) => {
    const el = document.activeElement;
    const key = el instanceof HTMLElement && body.current?.contains(el) ? el.closest<HTMLElement>("[data-panel-field]")?.dataset["panelField"] : undefined;
    const next = key ? revertField(changes, row ?? values, key, derivedFrom.current) : null;
    if (!next) return;
    e.preventDefault();
    setChanges(next);
  };
  // Radix báo "bấm ra ngoài" lúc pointerdown hoặc (thường) lúc click – hoãn một nhịp để xử lý của cú bấm (chọn ô khác) chạy trước.
  const onPointerDownOutside = () => {
    if (!leaveState.current.dirty || leaveState.current.busy) return;
    window.setTimeout(() => {
      const now = leaveState.current;
      if (now.dirty && !now.busy) setConfirm((c) => c ?? { next: now.shown, leaving: true });
    }, 0);
  };
  // Enter trong ô nhập của panel → lưu. Xử lý ở pha nổi bọt và hoãn một nhịp: ô ngày / mã chốt phần đang gõ bằng Enter của chính nó trước,
  // panel lưu theo giá trị đã chốt. Ô nằm ngoài cây DOM của panel (ô tìm của danh sách thả xuống – portal) không tính.
  /** Lưu bằng phím (Enter, Ctrl+S…) rồi hỏi Thoát panel · Ở lại; false = không có gì để lưu. */
  const enterSave = useRef<() => boolean>(() => false);
  useEffect(() => {
    enterSave.current = () => {
      if (!dirty || readOnlyReason || save.isPending) return false;
      save.mutate([...edits, ...confirmations, ...bulk], { onSuccess: () => { setChanges({}); setSaved(true); } });
      return true;
    };
  });
  const onEnter = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Enter" || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey || e.nativeEvent.isComposing) return;
    const el = e.target;
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) || !body.current?.contains(el)) return;
    if (el.getAttribute("aria-expanded") === "true" || (el instanceof HTMLInputElement && ["checkbox", "radio", "button", "submit"].includes(el.type))) return;
    e.preventDefault();
    window.setTimeout(() => enterSave.current(), 0);
  };
  const goOcr = () => {
    if (save.isPending) return;
    const href = item ? `${pathname}?step=ocr&dong=${item.lineNo}` : `${pathname}?step=ocr`;
    if (dirty) setConfirm({ next: shown, href });
    else router.replace(href, { scroll: false });
  };

  const onKeyDownCapture = (e: KeyboardEvent<HTMLDivElement>) => {
    // Enter trên ô chọn (Select · Combobox) đang đóng khi panel có thay đổi → lưu (Space / ↓ vẫn mở danh sách). Chặn ở pha bắt
    // vì ô chọn tự mở danh sách bằng Enter. Không có thay đổi → để ô chọn xử lý như thường.
    if (e.key === "Enter" && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey && dirty && e.target instanceof HTMLButtonElement
      && e.target.getAttribute("role") === "combobox" && e.target.getAttribute("aria-expanded") !== "true" && body.current?.contains(e.target)) {
      e.preventDefault();
      e.stopPropagation();
      window.setTimeout(() => enterSave.current(), 0);
      return;
    }
    if (e.key !== "Tab" || e.altKey || e.ctrlKey || e.metaKey) return;
    // Đang ở ô nhập: Tab / Shift+Tab nhảy thẳng sang ô nhập kế tiếp / trước của panel, bỏ qua nút vai trò (TH) và nút hướng dẫn
    // giữa các ô. Ô nhập cuối (Tab) / đầu (Shift+Tab) → theo thứ tự Tab thường (nút Hủy · Lưu rồi sang ô kế tiếp của bản in).
    const el = e.target;
    const root = body.current;
    if (el instanceof HTMLElement && el.matches(FIELDS) && root?.contains(el) && el.getAttribute("aria-expanded") !== "true") {
      const inputs = [...root.querySelectorAll<HTMLElement>(FIELDS)].filter((n) => n.offsetParent !== null || n === el);
      const to = inputs[inputs.indexOf(el) + (e.shiftKey ? -1 : 1)];
      if (to) {
        e.preventDefault();
        e.stopPropagation();
        to.focus();
        return;
      }
    }
    if (!shown || order.length === 0) return;
    const nodes = [...e.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.offsetParent !== null || n === document.activeElement);
    const edge = e.shiftKey ? nodes[0] : nodes[nodes.length - 1];
    if (!edge || document.activeElement !== edge) return;
    const next = nextTarget(order, shown, spot?.group.map((f) => f.key) ?? [shown.key], e.shiftKey ? -1 : 1);
    if (!next) return;
    e.preventDefault();
    e.stopPropagation();
    onTarget(next);
  };

  const role = field && spot ? fieldRole(kind, field, spot.parentNo) : undefined;
  // Vai trò cạnh tiêu đề (dòng mô tả của header), không nằm trong tên trợ năng của panel và không bị cắt.
  const roleNode = role === "REQUIRED" ? t.required : role === "CONDITIONAL" || role === "REFERENCE" ? <RoleMark role={role} /> : null;
  const description = item || roleNode ? <>{item ? fill(t.lineN, { n: item.lineNo }) : null}{item && roleNode ? " · " : null}{roleNode}</> : null;
  const cellErrors = !field ? [] : item ? errors.filter((e) => e.no !== undefined && e.no === no && e.line === (lineNos?.[line!] ?? item.lineNo)) : errorsForField(errors, no);

  return (
    <>
      <Dialog open={open} defaultPresentation="panel" onOpenChange={(o) => !o && onTarget(null)}>
        <DialogContent
          title={title}
          icon={<PenLine className="h-4 w-4" />}
          {...(description ? { description } : {})}
          onKeyDownCapture={onKeyDownCapture}
          onPointerDownOutside={onPointerDownOutside}
          onEscapeKeyDown={onEscapeKeyDown}
          // Mở panel: focus vào ô nhập của ô được chọn (gõ ngay được), không phải nút đầu tiên trên header như mặc định của Radix.
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            // Panel dựng lại (đổi khổ màn hình → đổi kiểu hiển thị) khi đang mở hộp hỏi: giữ focus ở hộp hỏi, không kéo về ô nhập.
            if (!confirm && !saved && !hsItem && !help) focusField(shownKey);
          }}
        >
          {spot && (
            <div ref={body} className="flex min-h-0 flex-1 flex-col gap-4" onFocus={(e) => { lastFocus.current = e.target; }} onKeyDown={onEnter}>
              {suspects.length > 0 && (
                <Alert
                  tone="warning"
                  title={t.suspectTitle}
                  // Nút ngay trong cảnh báo: hàng nút ở đáy panel có thể khuất (cửa sổ thấp / bị taskbar che) – vẫn xác nhận được.
                  {...(!dirty ? { action: (
                    <Button type="button" size="sm" variant="secondary" leftIcon={<CheckCircle2 className="h-4 w-4" />} loading={save.isPending} onClick={commit}>
                      {t.confirmOk}
                    </Button>
                  ) } : {})}
                >
                  {notes.map((n) => <p key={n}>{n}</p>)}
                  <p>{t.suspectBody}</p>
                </Alert>
              )}
              {/* Danh mục hàng hóa: ĐVT invoice khác ĐVT khai → phép quy đổi lượng cạnh ô số lượng (cả khi chỉ xem); sửa hệ số lô khi sửa được. */}
              {(item?.qtySuggestion || item?.quantity2) && spot.group.some((g) => QTY_KEYS.has(g.key)) && <QtySuggestionHint item={item} dossierId={dossierId} editable={!readOnlyReason} />}
              <PanelDetails
                kind={kind}
                spot={spot}
                item={item}
                decl={decl}
                values={{ ...(row ?? values), ...changes }}
                onChange={readOnlyReason ? undefined : change}
                lockOf={lockOf}
                errors={cellErrors}
                readOnlyReason={readOnlyReason}
                onOcr={goOcr}
                busy={save.isPending}
                onHs={setHsItem}
                amending={mode === "AMEND"}
              />
              {spread.lines > 0 && (
                <Checkbox
                  label={spread.lines === 1 ? t.applyAllLines1 : fill(t.applyAllLines, { n: formatNumber(spread.lines) })}
                  checked={applyAll}
                  disabled={save.isPending}
                  onChange={(e) => setApplyAll(e.target.checked)}
                />
              )}
              {!readOnlyReason && (
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-fg-muted">{t.enterHint}</p>
                  <Button type="button" size="sm" variant="ghost" leftIcon={<Keyboard className="h-4 w-4" />} onClick={() => setHelp(true)}>{t.shortcuts}</Button>
                </div>
              )}
              <DialogFooter>
                {readOnlyReason ? (
                  <Button type="button" variant="ghost" onClick={() => onTarget(null)}>{t.close}</Button>
                ) : (
                  <>
                    <Button type="button" variant="ghost" disabled={save.isPending} onClick={() => { setChanges({}); onTarget(null); }}>{t.cancel}</Button>
                    {!dirty && suspects.length > 0 ? (
                      <Button type="button" leftIcon={<CheckCircle2 className="h-4 w-4" />} loading={save.isPending} onClick={commit}>
                        {t.confirmOk}
                      </Button>
                    ) : !dirty && bulk.length > 0 ? (
                      <Button type="button" leftIcon={<CopyCheck className="h-4 w-4" />} loading={save.isPending} onClick={commit}>
                        {spread.lines === 1 ? t.applyLines1 : fill(t.applyLinesN, { n: formatNumber(spread.lines) })}
                      </Button>
                    ) : (
                      <Button type="button" leftIcon={<Save className="h-4 w-4" />} loading={save.isPending} disabled={!dirty} onClick={commit}>
                        {!dirty ? t.save : edits.length + bulk.length === 1 ? t.save1 : fill(t.saveN, { n: formatNumber(edits.length + bulk.length) })}
                      </Button>
                    )}
                  </>
                )}
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <UnsavedDialog
        open={confirm !== null}
        title={title}
        count={edits.length + bulk.length}
        leaving={confirm?.leaving ?? false}
        saving={save.isPending}
        onSave={() => {
          const c = confirm;
          if (!c || save.isPending) return;
          save.mutate([...edits, ...bulk], { onSuccess: () => proceed(c.next, c.href), onError: stay });
        }}
        onDiscard={() => confirm && proceed(confirm.next, confirm.href)}
        onStay={stay}
        onClosed={restoreFocus}
      />
      <SavedDialog
        open={saved}
        title={title}
        onExit={() => { setSaved(false); onTarget(null); }}
        onStay={() => { stayed.current = true; setSaved(false); }}
        onClosed={restoreFocus}
      />
      <ShortcutsDialog open={help} onClose={() => setHelp(false)} onClosed={() => { stayed.current = true; restoreFocus(); }} />
      <ChangeHsDialog item={hsItem} onClose={() => setHsItem(null)} dossierId={dossierId} />
    </>
  );
}
