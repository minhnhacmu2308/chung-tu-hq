"use client";
// Form tờ khai đầy đủ (Phụ lục II) chạy trên tờ khai thật của hồ sơ – tab "Tờ khai đầy đủ" ở bước Review.
// Giá trị lấy từ chỉ tiêu của tờ khai qua bảng chuyển mã (dossier-adapter). Sửa được ô một–một đã có trên tờ khai, lưu bằng API sửa chỉ tiêu
// (backend ghi field_audit); ô ghép / ô chưa lưu chỉ đọc. Dòng hàng chỉ đọc (sửa ở bước OCR, AI Agent).
import { Alert, Button, Stack, toast } from "@kb/ui";
import { layoutFor, type Declaration, type LineItem } from "@kb/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Save, Undo2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { declarationKeys, updateDeclarationField } from "@/api/declaration";
import { dossierKeys } from "@/api/dossiers";
import { toastMutationError } from "@/lib/mutation-error";
import { formatNumber } from "@/lib/format";
import type { FieldLockLookup } from "./amend-context";
import { DeclarantTab } from "./declarant-tab";
import { declarationValues, editableKeys, itemValues, pendingEdits } from "./dossier-adapter";
import type { FormValues } from "./form-state";
import { ViewPrefsProvider } from "./view-prefs";
import { navSections } from "./view-state";

type Props = {
  dossierId: string;
  decl: Declaration;
  items: LineItem[];
  /** Nháp + người dùng có quyền sửa tờ khai. */
  canEdit: boolean;
};

const NOT_SAVED = { basis: "SOFTWARE" as const, reason: "" };

export function DossierDeclarationForm({ dossierId, decl, items, canEdit }: Props) {
  const qc = useQueryClient();
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
  const itemRows = useMemo(() => itemValues(kind, items), [kind, items]);
  const editable = useMemo(() => editableKeys(kind, decl.fields, canEdit), [kind, decl.fields, canEdit]);
  const [draft, setDraft] = useState<FormValues>(original);
  // Nội dung tờ khai đổi (sau khi lưu, mở lại, sửa ở tab khác) → bản nháp theo dữ liệu mới. So theo nội dung: tải lại nền
  // (quay lại cửa sổ) cùng dữ liệu không xóa phần đang sửa dở.
  const originalKey = JSON.stringify(original);
  useEffect(() => setDraft(original), [originalKey]);
  const edits = pendingEdits(original, draft, editable);
  const lockOf: FieldLockLookup = (key) => (editable.has(key) ? null : NOT_SAVED);

  const save = useMutation({
    mutationFn: async (list: { code: string; value: string }[]) => {
      // Lưu lần lượt: mỗi chỉ tiêu một lần gọi (backend kiểm tra và ghi nhật ký sửa từng chỉ tiêu).
      for (const e of list) await updateDeclarationField(dossierId, e.code, e.value);
    },
    onSuccess: (_d, list) => toast({ tone: "success", title: `Đã lưu ${formatNumber(list.length)} chỉ tiêu` }),
    onError: toastMutationError("Không lưu được tờ khai"),
    // Lưu dở (lỗi giữa chừng) vẫn tải lại để màn hình đúng với dữ liệu đã lưu.
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: declarationKeys.view(dossierId) });
      void qc.invalidateQueries({ queryKey: dossierKeys.all });
    },
  });

  const notice = canEdit ? (
    <Alert tone={edits.length ? "warning" : "info"} title={edits.length ? `Có ${formatNumber(edits.length)} chỉ tiêu chưa lưu` : "Tờ khai đầy đủ theo Phụ lục II"}>
      <p>
        Sửa được {formatNumber(editable.size)} chỉ tiêu đã có trên tờ khai. Ô nền xám là ô phần mềm tự ghép khi truyền hoặc chưa lưu được ở bản này – sửa ở tab Thông tin chung,
        dòng hàng sửa ở bước OCR / AI Agent.
      </p>
      {edits.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="sm" leftIcon={<Save className="h-4 w-4" />} loading={save.isPending} onClick={() => save.mutate(edits)}>
            Lưu {formatNumber(edits.length)} thay đổi
          </Button>
          <Button size="sm" variant="ghost" leftIcon={<Undo2 className="h-4 w-4" />} disabled={save.isPending} onClick={() => setDraft(original)}>
            Hoàn tác
          </Button>
        </div>
      )}
    </Alert>
  ) : (
    <Alert tone="info" title="Tờ khai đầy đủ theo Phụ lục II – chỉ đọc">
      {decl.status === "DRAFT" ? "Bạn không có quyền sửa tờ khai." : "Tờ khai đã phê duyệt / đã truyền. Mở lại tờ khai để sửa."}
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
          items={itemRows}
          section={section}
          onSection={setSection}
          onChange={editable.size ? (key, value) => setDraft((v) => ({ ...v, [key]: value })) : undefined}
          amending={false}
          onAmend={() => {}}
          changed={0}
          lockOf={lockOf}
          prototypeActions={false}
          showMissing={false}
        />
      </Stack>
    </ViewPrefsProvider>
  );
}
