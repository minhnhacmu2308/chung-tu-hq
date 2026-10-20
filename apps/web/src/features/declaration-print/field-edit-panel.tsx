"use client";
// Panel sửa ô của bản in (Dialog dạng panel bên phải, không chặn trang): mở khi chọn một ô, hiện cả nhóm ô của chỉ tiêu, lưu bằng API sửa chỉ tiêu.
// `target` = ô người dùng vừa chọn; panel hiện `shown`. Còn thay đổi chưa lưu mà chọn ô khác / đóng / Tab sang ô khác / sang bước OCR
// → hỏi Lưu · Bỏ thay đổi · Ở lại (Ở lại trả lựa chọn về ô đang sửa). Tab ở phần tử cuối / Shift+Tab ở phần tử đầu → ô kế tiếp / trước theo `order`.
import { Button, Dialog, DialogContent, DialogFooter } from "@kb/ui";
import { fieldRole, type Declaration, type DeclarationEditMode, type LineItem } from "@kb/contracts";
import { PenLine, Save } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { formatNumber } from "@/lib/format";
import { ChangeHsDialog } from "../dossier-detail/steps/agent-step";
import { errorsForField, type FieldError } from "../dossier-detail/steps/customs-errors";
import { declarationLockOf, declarationValues, editableKeys, pendingEdits, pendingItemEdits } from "../declaration-form/dossier-adapter";
import { RoleMark } from "../declaration-form/field";
import { fieldTitle } from "../declaration-form/display";
import type { FormValues } from "../declaration-form/form-state";
import { useSaveDeclarationEdits } from "../declaration-form/use-save-edits";
import { PanelDetails } from "./panel-details";
import { fieldLocator, type PrintTarget } from "./print-state";
import { UnsavedDialog } from "./unsaved-dialog";

type Props = {
  dossierId: string;
  decl: Declaration;
  items: LineItem[];
  mode: DeclarationEditMode;
  canEdit: boolean;
  /** Giá trị đang hiện trên bản in: tờ khai (người khai + Hải quan + ước tính) và từng dòng hàng. */
  values: FormValues;
  itemRows: FormValues[];
  errors: FieldError[];
  /** Thứ tự Tab giữa các ô (panelOrder, bỏ ô "Chỉ tiêu khác" không áp dụng). */
  order: PrintTarget[];
  target: PrintTarget | null;
  onTarget: (t: PrintTarget | null) => void;
};

const tid = (t: PrintTarget | null) => (t ? `${t.line ?? ""}:${t.key}` : "");
const FOCUSABLE = "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])";

export function FieldEditPanel({ dossierId, decl, items, mode: stageMode, canEdit, values, itemRows, errors, order, target, onTarget }: Props) {
  const kind = decl.kind;
  const mode: DeclarationEditMode = canEdit ? stageMode : "LOCKED";
  const readOnlyReason = !canEdit ? "Bạn không có quyền sửa tờ khai." : mode === "LOCKED" ? "Tờ khai đã phê duyệt / đã truyền hoặc đã thông quan – không sửa ở giai đoạn này." : null;
  const save = useSaveDeclarationEdits(dossierId);
  const router = useRouter();
  const pathname = usePathname();
  const original = useMemo(() => declarationValues(kind, decl.fields), [kind, decl.fields]);
  const editable = useMemo(() => editableKeys(kind, decl.fields, mode), [kind, decl.fields, mode]);
  const lockOf = useMemo(() => declarationLockOf(kind, mode, original, editable), [kind, mode, original, editable]);

  const [shown, setShown] = useState<PrintTarget | null>(target);
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
  const [seen, setSeen] = useState(target);
  if (tid(seen) !== tid(target)) {
    setSeen(target);
    if (tid(target) !== tid(shown)) {
      if (dirty) setConfirm({ next: target });
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

  // Chuyển ô → focus ô nhập đầu tiên của ô mới (Tab tiếp tục điền).
  const body = useRef<HTMLDivElement>(null);
  const shownId = tid(shown);
  useEffect(() => {
    if (shownId) body.current?.querySelector<HTMLElement>("input:not([disabled]), textarea:not([disabled]), select:not([disabled])")?.focus();
  }, [shownId]);

  const proceed = (next: PrintTarget | null, href?: string) => {
    setConfirm(null);
    setChanges({});
    setShown(next);
    if (href) router.replace(href, { scroll: false });
  };
  const stay = () => {
    setConfirm(null);
    if (tid(target) !== tid(shown)) onTarget(shown);
  };
  const goOcr = () => {
    const href = item ? `${pathname}?step=ocr&dong=${item.lineNo}` : `${pathname}?step=ocr`;
    if (dirty) setConfirm({ next: shown, href });
    else router.replace(href, { scroll: false });
  };

  const onKeyDownCapture = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab" || !shown || order.length === 0) return;
    const nodes = [...e.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.offsetParent !== null || n === document.activeElement);
    const edge = e.shiftKey ? nodes[0] : nodes[nodes.length - 1];
    if (!edge || document.activeElement !== edge) return;
    const i = order.findIndex((t) => tid(t) === tid(shown));
    const next = order[(i + (e.shiftKey ? -1 : 1) + order.length) % order.length];
    if (!next) return;
    e.preventDefault();
    e.stopPropagation();
    onTarget(next);
  };

  const field = spot?.field;
  const no = field ? field.no ?? spot.parentNo : undefined;
  const title = field ? fieldTitle(no, field.label) : "";
  const cellErrors = !field ? [] : item ? errors.filter((e) => e.no !== undefined && e.no === no && e.line === item.lineNo) : errorsForField(errors, no);

  return (
    <>
      <Dialog open={Boolean(shown && spot)} defaultPresentation="panel" onOpenChange={(o) => !o && onTarget(null)}>
        <DialogContent
          title={field ? <>{title}{spot && <RoleMark role={fieldRole(kind, field, spot.parentNo)} />}</> : ""}
          icon={<PenLine className="h-4 w-4" />}
          {...(item ? { description: `Dòng hàng ${item.lineNo}` } : {})}
          onKeyDownCapture={onKeyDownCapture}
        >
          {spot && (
            <div ref={body} className="flex min-h-0 flex-1 flex-col gap-4">
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
                onHs={setHsItem}
              />
              <DialogFooter>
                {readOnlyReason ? (
                  <Button type="button" variant="ghost" onClick={() => onTarget(null)}>Đóng</Button>
                ) : (
                  <>
                    <Button type="button" variant="ghost" disabled={save.isPending} onClick={() => { setChanges({}); onTarget(null); }}>Hủy</Button>
                    <Button type="button" leftIcon={<Save className="h-4 w-4" />} loading={save.isPending} disabled={!dirty} onClick={() => save.mutate(edits)}>
                      {dirty ? `Lưu ${formatNumber(edits.length)} thay đổi` : "Lưu"}
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
          if (!c) return;
          save.mutate(edits, { onSuccess: () => proceed(c.next, c.href), onError: stay });
        }}
        onDiscard={() => confirm && proceed(confirm.next, confirm.href)}
        onStay={stay}
      />
      <ChangeHsDialog item={hsItem} onClose={() => setHsItem(null)} dossierId={dossierId} />
    </>
  );
}
