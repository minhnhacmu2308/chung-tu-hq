// Điền sẵn danh sách container từ chứng từ đã đọc (OCR): hàm thuần (ADR 0014). Thứ tự nguồn B/L → Packing List → Giấy báo hàng đến.
import { normalizeContainerNo, type ContainerListRow, type DocKind } from "@kb/contracts";

export type PrefillDoc = { id: string; kind: DocKind; page?: number; containers: { no: string | null; sealNo: string | null }[]; billNo: string | null };

const KIND_ORDER: Partial<Record<DocKind, number>> = { BILL_OF_LADING: 0, PACKING_LIST: 1, ARRIVAL_NOTICE: 2 };

/**
 * Mỗi container một dòng: số được chuẩn hóa (bỏ khoảng trắng/gạch, viết hoa) trước khi gộp trùng. Trùng giữa các chứng từ (HBL + MBL…):
 * giữ dòng của chứng từ đầu tiên (nguồn, số vận đơn), seal lấy giá trị khác rỗng đầu tiên.
 */
export function prefillContainerRows(docs: PrefillDoc[]): ContainerListRow[] {
  const ordered = docs.filter((d) => d.kind in KIND_ORDER).map((d, i) => ({ d, i })).sort((a, b) => KIND_ORDER[a.d.kind]! - KIND_ORDER[b.d.kind]! || a.i - b.i);
  const rows = new Map<string, ContainerListRow>();
  for (const { d } of ordered) {
    for (const c of d.containers) {
      const no = normalizeContainerNo(c.no ?? "");
      if (no === "") continue;
      const seal = (c.sealNo ?? "").trim();
      const have = rows.get(no);
      if (have) {
        if (have.sealNo === "" && seal !== "") have.sealNo = seal;
        continue;
      }
      rows.set(no, { billNo: (d.billNo ?? "").trim(), containerNo: no, sealNo: seal, note: "", source: "OCR", sourceDocumentId: d.id, ...(d.page ? { sourcePage: d.page } : {}) });
    }
  }
  return [...rows.values()];
}
