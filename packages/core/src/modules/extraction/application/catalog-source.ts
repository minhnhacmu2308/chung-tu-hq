// Nguồn cho danh mục hàng hóa ("Lấy từ chứng từ đã đọc"): dòng invoice/packing list đã đọc có Part No, kèm đối tác.
// Đối tác theo chiều hồ sơ: nhập (NK) → người bán = nhà cung cấp (SUPPLIER); xuất (XK) → người mua = khách hàng (CUSTOMER).
// Dòng mà đối tác chính là doanh nghiệp (trùng MST hoặc tên chuẩn hóa) bị bỏ – không tạo bộ mã đối tác cho chính mình.
// Chỉ đọc lô hàng mới nhất của mỗi hồ sơ; module catalog gọi qua composition root, ngoài transaction của nó.
import { asOrgId, asUserId } from "../../../shared/ids.js";
import { normalizeCompanyName } from "../domain/normalize.js";
import type { DocumentsPort, ExtractionDeps } from "./ports.js";

export type ShipmentCatalogLine = {
  dossierId: string; lineNo: number; partNo: string; description: string | null; unit: string | null; hsCode: string | null;
  direction: "NK" | "XK";
  /** Loại bộ mã đối tác: SUPPLIER (NK, người bán) · CUSTOMER (XK, người mua). */
  partnerKind: "SUPPLIER" | "CUSTOMER";
  partnerName: string | null;
};

const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

export async function listInvoiceLinesForCatalog(deps: { uow: ExtractionDeps["uow"]; documents: Pick<DocumentsPort, "dossierInfo" | "orgInfo"> }, orgId: string): Promise<ShipmentCatalogLine[]> {
  const rows = await deps.uow.asOrg({ orgId: asOrgId(orgId), userId: asUserId("") }, (r) => r.shipments.listLatestByOrg(orgId));
  if (!rows.length) return [];
  const org = await deps.documents.orgInfo(orgId);
  const orgTax = digits(org.taxCode);
  const orgName = org.name ? normalizeCompanyName(org.name) : "";
  const out: ShipmentCatalogLine[] = [];
  for (const s of rows) {
    const info = await deps.documents.dossierInfo(orgId, s.dossierId);
    if (!info) continue;
    const party = info.direction === "XK" ? s.data.parties?.buyer : s.data.parties?.seller;
    const name = party?.name?.value?.trim() || null;
    const tax = digits(party?.taxCode?.value);
    if ((orgTax && tax && tax === orgTax) || (orgName && name && normalizeCompanyName(name) === orgName)) continue;
    for (const it of s.data.items ?? []) {
      const partNo = it.partNo?.value?.trim();
      if (!partNo) continue;
      out.push({
        dossierId: s.dossierId, lineNo: it.lineNo, partNo, description: it.description?.value?.trim() || null, unit: it.unit?.value?.trim() || null, hsCode: it.hsOnInvoice?.value?.trim() || null,
        direction: info.direction, partnerKind: info.direction === "XK" ? "CUSTOMER" : "SUPPLIER", partnerName: name,
      });
    }
  }
  return out;
}
