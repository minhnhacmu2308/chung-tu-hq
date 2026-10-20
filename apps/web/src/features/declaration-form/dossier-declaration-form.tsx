"use client";
// Form tờ khai đầy đủ (Phụ lục II) chạy trên tờ khai thật của hồ sơ – tab "Tờ khai đầy đủ" ở bước Review.
// Giá trị lấy từ chỉ tiêu của tờ khai qua bảng chuyển mã (dossier-adapter). Ô sửa được theo giai đoạn (`mode`, quy tắc ở @kb/contracts app-fields):
// chưa khai báo → mọi ô người khai (trừ ô tính từ chứng từ); đã phân luồng + gọi IDD → khóa ô theo Phụ lục II, ghi căn cứ dưới ô; đã thông quan → chỉ đọc.
// Dòng hàng: số liệu chứng từ sửa ở bước OCR (nút mở đúng dòng), mã HS qua hộp chọn mã HS; ô chỉ có trên tờ khai (mã biểu thuế, miễn giảm…) sửa trực tiếp,
// lưu theo id dòng (HANG.<id>.<ô>). Lưu bằng API sửa chỉ tiêu (backend kiểm tra lại cùng quy tắc, ghi field_audit).
import { Alert, Button, Stack } from "@kb/ui";
import { layoutFor, type Declaration, type DeclarationEditMode, type LineItem } from "@kb/contracts";
import { FileSearch, Save, Search, Undo2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { formatNumber } from "@/lib/format";
import type { FieldLockLookup } from "./amend-context";
import { DeclarantTab } from "./declarant-tab";
import { ChangeHsDialog } from "../dossier-detail/steps/agent-step";
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
  /** Vai trò được sửa tờ khai (VIEWER chỉ xem). */
  canEdit: boolean;
  /** Tờ khai đã thông quan: không sửa tờ khai gốc, sửa qua bản khai bổ sung AMA. */
  cleared?: boolean;
};

export function DossierDeclarationForm({ dossierId, decl, items, mode: stageMode, canEdit, cleared = false }: Props) {
  const mode: DeclarationEditMode = canEdit ? stageMode : "LOCKED";
  const save = useSaveDeclarationEdits(dossierId);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const kind = decl.kind;
  const layout = layoutFor(kind);
  const sections = navSections(layout);
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
  const lockOf: FieldLockLookup = declarationLockOf(kind, mode, original, editable);
  const edits = [...pendingEdits(kind, original, draft, editable), ...(mode === "LOCKED" ? [] : pendingItemEdits(kind, items.map((it) => it.id), itemRows, itemDraft))];
  const editableCount = new Set(editable.values()).size;
  const goOcr = (lineNo: number) => router.replace(`${pathname}?step=ocr&dong=${lineNo}`, { scroll: false });
  const itemActions = (index: number) => {
    const it = items[index];
    if (!it || mode === "LOCKED") return null;
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
            Sửa số liệu chứng từ ở bước OCR
          </Button>
          <Button size="sm" variant="secondary" leftIcon={<Search className="h-4 w-4" />} onClick={() => setHsItem(it)}>
            Chọn mã HS
          </Button>
        </div>
      </Stack>
    );
  };

  const actions = edits.length > 0 && (
    <div className="flex flex-wrap gap-2 pt-1">
      <Button size="sm" leftIcon={<Save className="h-4 w-4" />} loading={save.isPending} onClick={() => save.mutate(edits)}>
        Lưu {formatNumber(edits.length)} thay đổi
      </Button>
      <Button size="sm" variant="ghost" leftIcon={<Undo2 className="h-4 w-4" />} disabled={save.isPending} onClick={() => {
          setDraft(original);
          setItemDraft(itemRows);
        }}>
        Hoàn tác
      </Button>
    </div>
  );
  const pending = edits.length ? `Có ${formatNumber(edits.length)} chỉ tiêu chưa lưu` : null;

  const notice =
    mode === "FULL" ? (
      <Alert tone={pending ? "warning" : "info"} title={pending ?? "Tờ khai chưa khai báo – nhập đủ chỉ tiêu theo Phụ lục II"}>
        <p>
          Sửa được {formatNumber(editableCount)} chỉ tiêu người khai nhập. Ô nền xám chỉ đọc: chỉ tiêu tính từ chứng từ (loại hình, trị giá, cước, bảo hiểm, khoản điều chỉnh…)
          – sửa ở bước đọc chứng từ rồi dựng lại. Dòng hàng: bấm vào dòng để nhập ô chỉ có trên tờ khai (mã biểu thuế, miễn giảm, thuế khác…); số liệu chứng từ và mã HS sửa qua nút ở đầu panel dòng.
        </p>
        {actions}
      </Alert>
    ) : mode === "AMEND" ? (
      <Alert tone="warning" title={pending ?? "Khai sửa đổi bổ sung – tờ khai đã phân luồng"}>
        <p>
          Chỉ sửa chỉ tiêu được khai bổ sung. Ô khóa ghi căn cứ ngay dưới ô: mục 3 Phụ lục II (không được khai bổ sung; thêm nhóm vận đơn, hóa đơn, bảo lãnh khi đã đề nghị
          giải phóng hàng), mục 4 (hệ thống không hỗ trợ – ghi nội dung đúng vào ô Ký hiệu và số hiệu). Sửa xong phê duyệt lại rồi khai tạm sửa đổi (IDA01).
        </p>
        {actions}
      </Alert>
    ) : (
      <Alert tone="info" title="Tờ khai đầy đủ theo Phụ lục II – chỉ đọc">
        {!canEdit
          ? "Bạn không có quyền sửa tờ khai."
          : cleared
            ? "Tờ khai đã thông quan – không sửa trên tờ khai gốc. Cần sửa thì lập bản khai bổ sung AMA ở bước 7 “Sửa sau thông quan”."
            : "Tờ khai đã phê duyệt / đã truyền. Mở lại tờ khai (chưa khai báo) hoặc gọi về sửa đổi bổ sung (IDD, khi đã phân luồng) để sửa."}
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
          onItemChange={mode === "LOCKED" ? undefined : (i, key, value) => setItemDraft((rows) => rows.map((r, j) => (j === i ? { ...r, [key]: value } : r)))}
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
