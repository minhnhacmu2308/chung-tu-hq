import type { Db } from "../client.js";
import { plans } from "../schema/index.js";

/** Hai gói (ADR 0011): Theo lượt (PAYG – 25.000 đ/lượt) và Hợp đồng năm (CONTRACT – giá niêm yết 0 = "Liên hệ"). */
export const PLANS = [
  { code: "PAYG", name: "Theo lượt", kind: "PAYG", pagesPerDossier: 40, priceVnd: "0", pricePerDeclarationVnd: "25000" },
  { code: "CONTRACT", name: "Hợp đồng năm", kind: "CONTRACT", pagesPerDossier: 100, priceVnd: "0", pricePerDeclarationVnd: "0" },
] as const;

/** Idempotent theo mã. Chỉ tạo khi chưa có – giá/số trang quản trị đã sửa không bị seed ghi đè (trừ `kind`). */
export async function seedPlans(db: Db) {
  for (const p of PLANS) {
    await db.insert(plans).values(p).onConflictDoUpdate({ target: plans.code, set: { kind: p.kind } });
  }
}
