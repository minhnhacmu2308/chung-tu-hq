"use client";
// Popup thêm/sửa bộ mã (Quản trị/Chủ – spec §6.2): loại (chế độ SHARED chỉ cho bộ nhà cung cấp/khách hàng; sửa thì không đổi loại),
// tên, tên đối tác (bộ đối tác), người phụ trách (chọn nhiều thành viên đang hoạt động, vai trò ≠ VIEWER), mã hiển thị chính.
import type { CatalogMode, CodeSet, CodeSetKind } from "@kb/contracts";
import {
  Alert, Button, Checkbox, Combobox, Dialog, DialogContent, DialogFooter, Field, fill, Input, Select, Stack, statusLabel, toast, useMessages, useUiLocale, type ComboboxOption,
} from "@kb/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Layers } from "lucide-react";
import { useState } from "react";
import { catalogKeys, saveCodeSet } from "@/api/catalog";
import { listMembers, memberKeys } from "@/api/session";
import { getFormatLocale } from "@/lib/format";
import { errorText } from "@/lib/reason-codes";
import { CATALOG_SETS_MESSAGES } from "./catalog.messages";
import { codeSetStatus } from "./code-set-label";

const PARTNER_KINDS: readonly CodeSetKind[] = ["SUPPLIER", "CUSTOMER"];
const DEPARTMENT_KINDS: readonly CodeSetKind[] = ["ACCOUNTING", "WAREHOUSE", "CUSTOMS"];

/** Loại bộ mã được tạo mới theo chế độ (spec §3): SHARED → chỉ đối tác; PER_DEPARTMENT → Kế toán/Kho/XNK + đối tác. */
export const creatableKinds = (mode: CatalogMode): readonly CodeSetKind[] => (mode === "SHARED" ? PARTNER_KINDS : [...DEPARTMENT_KINDS, ...PARTNER_KINDS]);

/** Thành viên chọn làm người phụ trách: đang hoạt động, vai trò khác Người xem (giữ cả người đang phụ trách để không mất khi sửa). */
export function useOwnerOptions(keep: readonly string[] = []): ComboboxOption[] {
  const members = useQuery({ queryKey: memberKeys.all, queryFn: listMembers });
  return (members.data ?? [])
    .filter((m) => (m.status === "ACTIVE" && m.role !== "VIEWER") || keep.includes(m.id))
    .map((m) => ({ value: m.id, label: m.name, description: m.email }));
}

export function CodeSetDialog({ set, mode, onClose }: { set: CodeSet | null; mode: CatalogMode; onClose: () => void }) {
  const t = useMessages(CATALOG_SETS_MESSAGES);
  const locale = useUiLocale();
  const qc = useQueryClient();
  const kinds = set ? [set.kind] : creatableKinds(mode);
  const [kind, setKind] = useState<CodeSetKind>(set?.kind ?? kinds[0]!);
  const [name, setName] = useState(set?.name ?? "");
  const [partnerName, setPartnerName] = useState(set?.partnerName ?? "");
  const [ownerIds, setOwnerIds] = useState<string[]>(set ? [...set.ownerIds] : []);
  const [primary, setPrimary] = useState(set?.isPrimaryDisplay ?? false);
  const owners = useOwnerOptions(set?.ownerIds ?? []);
  const isPartner = PARTNER_KINDS.includes(kind);
  const save = useMutation({
    mutationFn: () =>
      saveCodeSet(set?.id ?? null, {
        kind, name: name.trim(), ownerIds, isPrimaryDisplay: primary, ...(isPartner ? { partnerName: partnerName.trim() || name.trim() } : {}),
      }),
    onSuccess: (s) => {
      void qc.invalidateQueries({ queryKey: catalogKeys.all });
      toast({ tone: "success", title: fill(t.saved, { name: s.name }) });
      onClose();
    },
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={set ? t.dialogEditTitle : t.dialogAddTitle}
        description={!set && mode === "SHARED" ? t.dialogDescriptionShared : t.dialogDescription}
        icon={<Layers className="h-4 w-4" />}
        size="md"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) save.mutate();
          }}
        >
          <Stack gap="md">
            {save.isError && <Alert tone="danger">{errorText(save.error, getFormatLocale(), t.saveFailed)}</Alert>}
            <Field label={t.fieldKind} required>
              <Select
                options={kinds.map((k) => ({ value: k, label: statusLabel(codeSetStatus(k), locale) }))}
                value={kind}
                onChange={(e) => setKind(e.target.value as CodeSetKind)}
                disabled={!!set}
              />
            </Field>
            <Field label={t.fieldName} required>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t.namePlaceholder} autoFocus />
            </Field>
            {isPartner && (
              <Field label={t.fieldPartner}>
                <Input value={partnerName} onChange={(e) => setPartnerName(e.target.value)} placeholder={t.partnerPlaceholder} />
              </Field>
            )}
            <Field label={t.fieldOwners} hint={t.ownersHint}>
              <Combobox multiple options={owners} value={ownerIds} onChange={setOwnerIds} placeholder={t.ownersPlaceholder} emptyText={t.ownersEmpty} />
            </Field>
            <Checkbox label={t.fieldPrimary} checked={primary} onChange={(e) => setPrimary(e.target.checked)} />
          </Stack>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>{t.cancel}</Button>
            <Button type="submit" loading={save.isPending} disabled={!name.trim()}>{t.save}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
