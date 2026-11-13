// Bộ mã đối tác (nhà cung cấp / khách hàng) nhận theo tên đã chuẩn hóa (partner_key); chưa có → tạo (spec §5: "chưa có → tạo bộ").
// Có ở cả hai chế độ (SHARED / PER_DEPARTMENT). Bộ tự tạo chưa có người phụ trách – Quản trị/Chủ duyệt hoặc giao người phụ trách sau.
import { itemNameKey } from "@kb/contracts";
import type { OrgId } from "../../../shared/ids.js";
import { asUserId } from "../../../shared/ids.js";
import { DEFAULT_SET_NAME, isDuplicate } from "./common.js";
import type { CatalogDeps, CatalogRepos, CodeSetRow } from "./ports.js";

export async function ensurePartnerSetInTx(deps: Pick<CatalogDeps, "clock" | "idGen">, r: CatalogRepos, orgId: OrgId, kind: "SUPPLIER" | "CUSTOMER", partnerName: string): Promise<string | null> {
  const name = partnerName.trim();
  const key = name ? itemNameKey(name) : "";
  if (!key) return null;
  const found = (await r.codeSets.list(orgId)).find((s) => s.kind === kind && s.partnerKey === key);
  if (found) return found.id;
  const now = deps.clock.now();
  const row: CodeSetRow = {
    // Tên bộ = tên đối tác (như "Lấy từ chứng từ đã đọc"); người dùng đổi tên được.
    id: deps.idGen.next("cst"), orgId, kind, name: name.slice(0, 100) || DEFAULT_SET_NAME[kind], partnerName: name.slice(0, 200), partnerKey: key,
    isPrimaryDisplay: false, isDefault: false, createdAt: now, updatedAt: now,
  };
  await r.codeSets.insert(row);
  return row.id;
}

/** Unique (org, loại, partner_key) – hai request song song cùng tạo một bộ đối tác. */
export const PARTNER_SET_UQ = "code_sets_org_kind_partner_uq";

/**
 * Bộ đối tác trong transaction ngắn riêng; đua tạo (unique PARTNER_SET_UQ) → đọc lại bộ bên kia vừa tạo (transaction mới).
 * Gọi TRƯỚC transaction chính của use case (lỗi unique làm hỏng transaction đang mở trên Postgres).
 */
export async function ensurePartnerSet(deps: Pick<CatalogDeps, "uow" | "clock" | "idGen">, orgId: OrgId, kind: "SUPPLIER" | "CUSTOMER", partnerName: string): Promise<string | null> {
  const sys = { orgId, userId: asUserId("") };
  try {
    return await deps.uow.asOrg(sys, (r) => ensurePartnerSetInTx(deps, r, orgId, kind, partnerName));
  } catch (e) {
    if (!isDuplicate(e, PARTNER_SET_UQ)) throw e;
    const key = itemNameKey(partnerName.trim());
    return deps.uow.asOrg(sys, async (r) => (await r.codeSets.list(orgId)).find((s) => s.kind === kind && s.partnerKey === key)?.id ?? null);
  }
}
