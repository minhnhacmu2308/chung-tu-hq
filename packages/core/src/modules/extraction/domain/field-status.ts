// Trạng thái trường theo ADR 0003: tính từ tín hiệu (số nguồn khớp/khác, định dạng, model không chắc), không lấy từ model.
import type { DocKind, FieldStatus } from "@kb/contracts";

export type Candidate = { kind: DocKind; normalized: string; raw: string; unsure: boolean };
export type Threshold = "STRICT" | "BALANCED" | "RELAXED";

const KIND_LABEL: Record<DocKind, string> = {
  INVOICE: "Invoice", PACKING_LIST: "Packing List", BILL_OF_LADING: "B/L", AIR_WAYBILL: "AWB", CERT_OF_ORIGIN: "C/O", SALES_CONTRACT: "Contract",
  ARRIVAL_NOTICE: "Arrival Notice", FREIGHT_INVOICE: "Hóa đơn cước", OTHER: "Chứng từ khác",
};

export function fieldStatusFromCandidates(cands: Candidate[], formatValid: boolean): { status: FieldStatus; note?: string } {
  if (!formatValid) return { status: "INVALID_FORMAT" };
  const distinct = [...new Set(cands.map((c) => c.normalized))];
  if (distinct.length > 1) {
    const others = cands.slice(1).map((c) => `${KIND_LABEL[c.kind]} ghi ${c.raw}`).join("; ");
    return { status: "CONFLICT", note: others };
  }
  // Hai loại chứng từ độc lập ghi cùng một giá trị (AWB và hóa đơn cước cùng số vận đơn) là tín hiệu mạnh hơn việc model tự thấy không chắc.
  if (new Set(cands.map((c) => c.kind)).size >= 2) return { status: "CROSS_CHECKED" };
  if (cands.some((c) => c.unsure)) return { status: "MODEL_UNSURE", note: "Model không chắc giá trị này" };
  return { status: cands.length >= 2 ? "CROSS_CHECKED" : "SINGLE_SOURCE" };
}

const FLAGGED: Record<Threshold, FieldStatus[]> = {
  STRICT: ["CONFLICT", "INVALID_FORMAT", "MODEL_UNSURE", "SINGLE_SOURCE"],
  BALANCED: ["CONFLICT", "INVALID_FORMAT", "MODEL_UNSURE"],
  RELAXED: ["CONFLICT", "INVALID_FORMAT"],
};

export const isSuspect = (status: FieldStatus, threshold: Threshold = "BALANCED") => FLAGGED[threshold].includes(status);
export const kindLabel = (k: DocKind) => KIND_LABEL[k];
