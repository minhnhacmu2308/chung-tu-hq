"use client";
// Bước Review: điều kiện giao hàng trên hóa đơn bị người khai sửa khác mã máy đọc (FCA → CIF) → nhắc người duyệt, kèm lý do đã ghi
// khi vận đơn mâu thuẫn người trả cước. Sửa địa điểm cùng mã ("FCA BUSAN" → "FCA CHANGWON") không nhắc.
import { incotermOf } from "@kb/contracts";
import { Alert, fill, useMessages } from "@kb/ui";
import { useQuery } from "@tanstack/react-query";
import { listFields, ocrKeys } from "@/api/ocr";
import { listMembers, settingsKeys } from "@/api/settings";
import { getValueCharges, valueChargesKeys } from "@/api/value-charges";
import { formatDateTime } from "@/lib/format";
import { freightTermReasonLabel } from "../ocr/value-charges-form";
import { VALUE_CHARGES_MESSAGES } from "../ocr/value-charges.messages";
import { INCOTERM_CHANGED_MESSAGES } from "./incoterm-changed-note.messages";

export function IncotermChangedNote({ dossierId }: { dossierId: string }) {
  const t = useMessages(INCOTERM_CHANGED_MESSAGES);
  const tc = useMessages(VALUE_CHARGES_MESSAGES);
  const fields = useQuery({ queryKey: ocrKeys.fields(dossierId), queryFn: () => listFields(dossierId) });
  const charges = useQuery({ queryKey: valueChargesKeys.detail(dossierId), queryFn: () => getValueCharges(dossierId) });
  const members = useQuery({ queryKey: settingsKeys.members, queryFn: listMembers });
  const f = fields.data?.find((x) => x.key === "incoterm" && incotermOf(x.originalValue) !== "" && incotermOf(x.value) !== incotermOf(x.originalValue));
  if (!f) return null;
  const note = charges.data?.charges.freightTermNote;
  // Người sửa theo tài khoản đăng nhập lúc sửa (confirmedBy); dữ liệu cũ chưa ghi → câu chung "người khai sửa".
  const who = f.confirmedBy ? members.data?.find((m) => m.id === f.confirmedBy)?.name : undefined;
  return (
    <Alert tone="info" title={fill(t.title, { from: incotermOf(f.originalValue), to: incotermOf(f.value) || f.value })}>
      <p>
        {who && f.confirmedAt
          ? fill(t.bodyBy, { original: f.originalValue, value: f.value, who, at: formatDateTime(f.confirmedAt) })
          : fill(t.body, { original: f.originalValue, value: f.value })}
      </p>
      {note && <p>{fill(t.reason, { reason: `${freightTermReasonLabel(tc, note.reason)}${note.note ? `: ${note.note}` : ""}` })}</p>}
    </Alert>
  );
}
