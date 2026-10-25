"use client";
// Panel sửa ô của bản in (Dialog dạng panel bên phải, không chặn trang): mở khi chọn một ô, hiện cả nhóm ô của chỉ tiêu, lưu bằng API sửa chỉ tiêu.
// `target` = ô người dùng vừa chọn; panel hiện `shown`. Còn thay đổi chưa lưu mà chọn ô khác / đóng / Tab sang ô khác / sang bước OCR
// → hỏi Lưu · Bỏ thay đổi · Ở lại (Ở lại trả lựa chọn và focus về ô đang sửa). Đang lưu → chờ lưu xong mới chuyển ô (không hỏi / lưu lặp).
// Tab ở phần tử cuối / Shift+Tab ở phần tử đầu → ô kế tiếp / trước theo `order`, bỏ qua các ô cùng nhóm (panel đã hiện cả nhóm).
import { Button, Dialog, DialogContent, DialogFooter, fill, useMessages, useUiLocale } from "@kb/ui";
import { editBlockFor, fieldRole, type Declaration, type DeclarationEditMode, type DeclarationEditScope, type LineItem } from "@kb/contracts";
import { PenLine, Save } from "lucide-react";
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
import { PanelDetails } from "./panel-details";
import { fieldLocator, nextTarget, type PrintTarget } from "./print-state";
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
const INPUTS = "input:not([disabled]), textarea:not([disabled]), select:not([disabled])";
const FOCUSABLE = "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])";

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
  const lockOf = useMemo(() => declarationLockOf(kind, mode, original, editable, locale), [kind, mode, original, editable, locale]);
  const [changes, setChanges] = useState<FormValues>({});
  const [confirm, setConfirm] = useState<{ next: PrintTarget | null; href?: string } | null>(null);
  const [hsItem, setHsItem] = useState<LineItem | null>(null);

  const spot = shown ? fieldLocator(kind).get(shown.key) : undefined;
  const line = shown?.line;
  const item = line === undefined ? undefined : items[line];
  const row = line === undefined ? undefined : itemRows[line];
  const edits = !spot || readOnlyReason ? []
    : line === undefined ? pendingEdits(kind, original, { ...original, ...changes }, editable)
    : item && row ? pendingItemEdits(kind, [item.id], [row], [{ ...row, ...changes }]) : [];
  const dirty = edits.length > 0;

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
    const own = key ? root?.querySelector<HTMLElement>(`[data-panel-field="${key}"] :is(${INPUTS})`) : null;
    (own ?? root?.querySelector<HTMLElement>(INPUTS))?.focus();
  }, []);
  const shownId = tid(shown);
  useEffect(() => {
    if (shownId) focusField(shownKey);
  }, [shownId, shownKey, focusField]);
  /** Đóng hộp hỏi: focus lại ô đang focus trước đó trong panel (còn trên trang), không thì ô đang chọn. */
  // Chỉ khi chọn "Ở lại" (hoặc lưu lỗi): Lưu / Bỏ thay đổi đã chuyển ô – focus do effect chuyển ô đặt, không kéo về ô cũ.
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
  const goOcr = () => {
    if (save.isPending) return;
    const href = item ? `${pathname}?step=ocr&dong=${item.lineNo}` : `${pathname}?step=ocr`;
    if (dirty) setConfirm({ next: shown, href });
    else router.replace(href, { scroll: false });
  };

  const onKeyDownCapture = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab" || !shown || order.length === 0) return;
    const nodes = [...e.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.offsetParent !== null || n === document.activeElement);
    const edge = e.shiftKey ? nodes[0] : nodes[nodes.length - 1];
    if (!edge || document.activeElement !== edge) return;
    const next = nextTarget(order, shown, spot?.group.map((f) => f.key) ?? [shown.key], e.shiftKey ? -1 : 1);
    if (!next) return;
    e.preventDefault();
    e.stopPropagation();
    onTarget(next);
  };

  const field = spot?.field;
  const no = field ? field.no ?? spot.parentNo : undefined;
  const title = field ? fieldTitle(no, field.label) : "";
  const role = field && spot ? fieldRole(kind, field, spot.parentNo) : undefined;
  // Vai trò cạnh tiêu đề (dòng mô tả của header), không nằm trong tên trợ năng của panel và không bị cắt.
  const roleNode = role === "REQUIRED" ? t.required : role === "CONDITIONAL" || role === "REFERENCE" ? <RoleMark role={role} /> : null;
  const description = item || roleNode ? <>{item ? fill(t.lineN, { n: item.lineNo }) : null}{item && roleNode ? " · " : null}{roleNode}</> : null;
  const cellErrors = !field ? [] : item ? errors.filter((e) => e.no !== undefined && e.no === no && e.line === (lineNos?.[line!] ?? item.lineNo)) : errorsForField(errors, no);

  return (
    <>
      <Dialog open={Boolean(shown && spot)} defaultPresentation="panel" onOpenChange={(o) => !o && onTarget(null)}>
        <DialogContent
          title={title}
          icon={<PenLine className="h-4 w-4" />}
          {...(description ? { description } : {})}
          onKeyDownCapture={onKeyDownCapture}
        >
          {spot && (
            <div ref={body} className="flex min-h-0 flex-1 flex-col gap-4" onFocus={(e) => { lastFocus.current = e.target; }}>
              <PanelDetails
                kind={kind}
                spot={spot}
                item={item}
                decl={decl}
                values={{ ...(row ?? values), ...changes }}
                onChange={readOnlyReason ? undefined : (key, value) => setChanges((c) => ({ ...c, [key]: value }))}
                lockOf={lockOf}
                errors={cellErrors}
                readOnlyReason={readOnlyReason}
                onOcr={goOcr}
                busy={save.isPending}
                onHs={setHsItem}
              />
              <DialogFooter>
                {readOnlyReason ? (
                  <Button type="button" variant="ghost" onClick={() => onTarget(null)}>{t.close}</Button>
                ) : (
                  <>
                    <Button type="button" variant="ghost" disabled={save.isPending} onClick={() => { setChanges({}); onTarget(null); }}>{t.cancel}</Button>
                    <Button type="button" leftIcon={<Save className="h-4 w-4" />} loading={save.isPending} disabled={!dirty} onClick={() => save.mutate(edits, { onSuccess: () => setChanges({}) })}>
                      {dirty ? fill(t.saveN, { n: formatNumber(edits.length) }) : t.save}
                    </Button>
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
        count={edits.length}
        saving={save.isPending}
        onSave={() => {
          const c = confirm;
          if (!c || save.isPending) return;
          save.mutate(edits, { onSuccess: () => proceed(c.next, c.href), onError: stay });
        }}
        onDiscard={() => confirm && proceed(confirm.next, confirm.href)}
        onStay={stay}
        onClosed={restoreFocus}
      />
      <ChangeHsDialog item={hsItem} onClose={() => setHsItem(null)} dossierId={dossierId} />
    </>
  );
}
