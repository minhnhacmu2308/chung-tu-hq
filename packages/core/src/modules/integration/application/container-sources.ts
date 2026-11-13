// Dữ liệu model của chứng từ → nguồn điền sẵn danh sách container (parse Zod – dữ liệu từ AI, bất biến 9).
import type { DocKind } from "@kb/contracts";
import { z } from "zod";
import type { PrefillDoc } from "../domain/container-prefill.js";

const RawSchema = z.object({
  billNo: z.string().nullish(),
  containers: z.array(z.object({ no: z.string().nullish(), sealNo: z.string().nullish() })).nullish(),
});

/** Dữ liệu model của một chứng từ → PrefillDoc (chỉ B/L có trường container trong schema trích xuất hiện tại); không đọc được → rỗng. */
export function prefillDocOf(doc: { id: string; kind: DocKind }, raw: unknown): PrefillDoc {
  const p = RawSchema.safeParse(raw);
  const data = p.success ? p.data : { billNo: null, containers: null };
  return { id: doc.id, kind: doc.kind, billNo: data.billNo ?? null, containers: (data.containers ?? []).map((c) => ({ no: c.no ?? null, sealNo: c.sealNo ?? null })) };
}
