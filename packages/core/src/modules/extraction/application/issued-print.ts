// Mã hàng in trên hóa đơn phát hành theo bộ mã (ADR 0015 §5). Tra danh mục NGOÀI transaction, trả bảng thuần cho `buildSnapshot`.
// Chọn bộ: mẫu chỉ định → (null) bộ khách hàng của người mua → Kế toán ("Mã chung" ở chế độ SHARED) → mã nối. ITEM_NO = luôn in mã nối.
import type { InvoiceLayout, Shipment } from "@kb/contracts";
import type { OrgId } from "../../../shared/ids.js";
import type { PrintCatalog } from "../domain/issued.js";
import type { ExtractionDeps } from "./ports.js";

const catalogIdsOf = (s: Shipment | null): string[] => [...new Set((s?.items ?? []).map((it) => it.catalogItemId?.trim()).filter((x): x is string => !!x))];

export async function loadPrintCatalog(deps: Pick<ExtractionDeps, "catalog">, orgId: OrgId, shipment: Shipment | null, layout: InvoiceLayout): Promise<PrintCatalog> {
  const port = deps.catalog;
  const ids = catalogIdsOf(shipment);
  if (!port || !ids.length) return {};
  const pick = layout.itemCodeSet;
  let setRef: string | null;
  if (pick && "kind" in pick) setRef = null;
  else if (pick) setRef = pick.codeSetId;
  else setRef = (await port.findPartnerSet(orgId, "CUSTOMER", shipment?.parties.buyer.name.value ?? "")) ?? "ACCOUNTING";
  const briefs = await port.describeItems(orgId, ids);
  const out: PrintCatalog = {};
  for (const id of ids) {
    const b = briefs[id];
    if (!b) continue;
    out[id] = { itemNo: b.itemNo, baseUnit: b.baseUnit, conversion: b.conversion, code: setRef ? await port.codeInSet(orgId, id, setRef) : null };
  }
  return out;
}
