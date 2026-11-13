// Nguồn cho danh mục hàng hóa ("Lấy từ chứng từ đã đọc"): dòng tờ khai đã duyệt / đã truyền có mã hàng + HS đã xác nhận.
// Chỉ đọc; module catalog gọi qua composition root, ngoài transaction của nó.
import { asOrgId, asUserId } from "../../../shared/ids.js";
import type { DeclarationDeps } from "./ports.js";

export type ApprovedDeclarationLine = { declarationId: string; dossierId: string; lineNo: number; itemCode: string; description: string; unit: string; hsCode: string };

/** Dòng hàng của tờ khai mới nhất mỗi hồ sơ ở trạng thái APPROVED/SUBMITTED, có mã hàng và HS đã xác nhận. */
export async function listApprovedLinesForCatalog(deps: Pick<DeclarationDeps, "uow">, orgId: string): Promise<ApprovedDeclarationLine[]> {
  return deps.uow.asOrg({ orgId: asOrgId(orgId), userId: asUserId("") }, async (r) => {
    const out: ApprovedDeclarationLine[] = [];
    for (const d of await r.declarations.listLatestByStatus(orgId, ["APPROVED", "SUBMITTED"])) {
      for (const l of await r.lineItems.list(orgId, d.dossierId)) {
        const code = l.itemCode?.trim();
        if (!code || !l.hsConfirmed) continue;
        out.push({ declarationId: d.id, dossierId: d.dossierId, lineNo: l.lineNo, itemCode: code, description: l.description, unit: l.unit, hsCode: l.hsConfirmed });
      }
    }
    return out;
  });
}
