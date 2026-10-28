"use client";
// Form tờ khai đầy đủ (Phụ lục II) chạy trên tờ khai thật của hồ sơ – tab "Tờ khai đầy đủ" ở bước Review.
// Giá trị lấy từ chỉ tiêu của tờ khai qua bảng chuyển mã (dossier-adapter). Ô sửa được theo giai đoạn (`mode`, quy tắc ở @kb/contracts app-fields):
// chưa khai báo → mọi ô người khai (trừ ô tính từ chứng từ); đã phân luồng + gọi IDD → khóa ô theo Phụ lục II, ghi căn cứ dưới ô; đã thông quan → chỉ đọc.
// Dòng hàng: số liệu chứng từ sửa ở bước OCR (nút mở đúng dòng), mã HS qua hộp chọn mã HS; ô chỉ có trên tờ khai (mã biểu thuế, miễn giảm…) sửa trực tiếp,
// lưu theo id dòng (HANG.<id>.<ô>). Lưu bằng API sửa chỉ tiêu (backend kiểm tra lại cùng quy tắc, ghi field_audit).
import { Alert, Button, fill, Stack, useMessages, useUiLocale } from "@kb/ui";
import { layoutFor, sheetOfLine, type Declaration, type DeclarationEditMode, type DeclarationEditScope, type LineItem } from "@kb/contracts";
import { FileSearch, Save, Search, Undo2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { formatNumber } from "@/lib/format";
import type { FieldLockLookup } from "./amend-context";
import { DeclarantTab } from "./declarant-tab";
import { ChangeHsDialog } from "../dossier-detail/steps/agent-step";
import { FORM_MESSAGES } from "./form.messages";
import { declarationLockOf, declarationValues, editableKeys, itemValues, pendingEdits, pendingItemEdits } from "./dossier-adapter";
import type { FormValues } from "./form-state";
import { useSaveDeclarationEdits } from "./use-save-edits";
import { ViewPrefsProvider } from "./view-prefs";
import { navSections } from "./view-state";

type Props = {
  dossierId: string;
  decl: Declaration;
  items: LineItem[];
  /** Chế độ sửa theo giai đoạn tờ khai (declarationEditMode). */
  mode: DeclarationEditMode;
  /** Phạm vi sửa theo tờ đã gọi về (lô nhiều tờ): dòng của tờ chưa gọi về chỉ đọc; không truyền → `mode` cho mọi dòng. */
  scope?: DeclarationEditScope;
  /** Vai trò được sửa tờ khai (VIEWER chỉ xem). */
  canEdit: boolean;
  /** Tờ khai đã thông quan: không sửa tờ khai gốc, sửa qua bản khai bổ sung AMA. */
  cleared?: boolean;
};

export function DossierDeclarationForm({ dossierId, decl, items, mode: stageMode, scope, canEdit, cleared = false }: Props) {
  const t = useMessages(FORM_MESSAGES);
  const locale = useUiLocale();
  const mode: DeclarationEditMode = canEdit ? stageMode : "LOCKED";
  const save = useSaveDeclarationEdits(dossierId);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const kind = decl.kind;
  const layout = layoutFor(kind);
  const sections = navSections(layout, locale);
  const requested = params.get("nhom");
  const section = sections.some((s) => s.id === requested) ? requested! : sections[0]!.id;
  const setSection = (id: string) => {
    const next = new URLSearchParams(params.toString());
    next.set("nhom", id);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const original = useMemo(() => declarationValues(kind, decl.fields), [kind, decl.fields]);
  const ctxCurrency = decl.fields.find((f) => f.code === "MA_TT")?.value.trim() || "USD";
  const vbpq = decl.fields.find((f) => f.code === "VBPQ")?.value ?? "";
  const itemRows = useMemo(() => itemValues(kind, items, { fields: decl.fields, currency: ctxCurrency, vbpq }), [kind, items, decl.fields, ctxCurrency, vbpq]);
  const [itemDraft, setItemDraft] = useState<FormValues[]>(itemRows);
  const itemKey = JSON.stringify(itemRows);
  useEffect(() => setItemDraft(itemRows), [itemKey]);
  const [hsItem, setHsItem] = useState<LineItem | null>(null);
  const editable = useMemo(() => editableKeys(kind, decl.fields, mode), [kind, decl.fields, mode]);
  const [draft, setDraft] = useState<FormValues>(original);
  // Nội dung tờ khai đổi (sau khi lưu, mở lại, sửa ở tab khác) → bản nháp theo dữ liệu mới. So theo nội dung: tải lại nền
  // (quay lại cửa sổ) cùng dữ liệu không xóa phần đang sửa dở.
  const originalKey = JSON.stringify(original);
  useEffect(() => setDraft(original), [originalKey]);
  const lockOf: FieldLockLookup = declarationLockOf(kind, mode, original, editable, locale);
  // Dòng sửa được: theo tờ chứa dòng (lô nhiều tờ chỉ gọi về một số tờ), không có phạm vi → theo chế độ chung.
  const lineNos = items.map((it) => it.lineNo);
  const lineEditable = (i: number) => canEdit && (scope ? scope.lines[sheetOfLine(lineNos, items[i]?.lineNo ?? 0)] ?? scope.common : stageMode) !== "LOCKED";
  const editableLines = items.map((_, i) => i).filter(lineEditable);
  const anyLineEditable = editableLines.length > 0;
  const edits = [
    ...pendingEdits(kind, original, draft, editable),
    ...pendingItemEdits(kind, editableLines.map((i) => items[i]!.id), editableLines.map((i) => itemRows[i]!), editableLines.map((i) => itemDraft[i]!)),
  ];
  const editableCount = new Set(editable.values()).size;
  const goOcr = (lineNo: number) => router.replace(`${pathname}?step=ocr&dong=${lineNo}`, { scroll: false });
  const itemActions = (index: number) => {
    const it = items[index];
    if (!it || !lineEditable(index)) return null;
    return (
      <Stack gap="sm">
        {/* Panel dòng hàng che thông báo đầu form → lưu ngay trong panel. */}
        {pending && (
          <Alert tone="warning" title={pending}>
            {actions}
          </Alert>
        )}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" leftIcon={<FileSearch className="h-4 w-4" />} onClick={() => goOcr(it.lineNo)}>
            {t.editAtOcr}
          </Button>
          <Button size="sm" variant="secondary" leftIcon={<Search className="h-4 w-4" />} onClick={() => setHsItem(it)}>
            {t.pickHs}
          </Button>
        </div>
      </Stack>
    );
  };

  const actions = edits.length > 0 && (
    <div className="flex flex-wrap gap-2 pt-1">
      <Button size="sm" leftIcon={<Save className="h-4 w-4" />} loading={save.isPending} onClick={() => save.mutate(edits)}>
        {edits.length === 1 ? t.save1 : fill(t.saveN, { n: formatNumber(edits.length) })}
      </Button>
      <Button size="sm" variant="ghost" leftIcon={<Undo2 className="h-4 w-4" />} disabled={save.isPending} onClick={() => {
          setDraft(original);
          setItemDraft(itemRows);
        }}>
        {t.undo}
      </Button>
    </div>
  );
  const pending = edits.length ? fill(t.pendingN, { n: formatNumber(edits.length) }) : null;

  const notice =
    mode === "FULL" ? (
      <Alert tone={pending ? "warning" : "info"} title={pending ?? t.fullTitle}>
        <p>{fill(t.fullBody, { n: formatNumber(editableCount) })}</p>
        {actions}
      </Alert>
    ) : mode === "AMEND" ? (
      <Alert tone="warning" title={pending ?? t.amendTitle}>
        <p>{t.amendBody}</p>
        {actions}
      </Alert>
    ) : (
      <Alert tone="info" title={t.readTitle}>
        {!canEdit
          ? t.noPermission
          : cleared
            ? t.clearedNote
            : t.lockedNote}
      </Alert>
    );

  return (
    <ViewPrefsProvider>
      <Stack gap="md">
        {notice}
        <DeclarantTab
          layout={layout}
          stage="nhap"
          values={draft}
          items={itemDraft}
          section={section}
          onSection={setSection}
          onChange={editable.size ? (key, value) => setDraft((v) => ({ ...v, [key]: value })) : undefined}
          onItemChange={anyLineEditable ? (i, key, value) => lineEditable(i) && setItemDraft((rows) => rows.map((r, j) => (j === i ? { ...r, [key]: value } : r))) : undefined}
          itemActions={itemActions}
          amending={false}
          onAmend={() => {}}
          changed={0}
          lockOf={lockOf}
          prototypeActions={false}
          showMissing={false}
        />
      </Stack>
      <ChangeHsDialog item={hsItem} onClose={() => setHsItem(null)} dossierId={dossierId} />
    </ViewPrefsProvider>
  );
}
