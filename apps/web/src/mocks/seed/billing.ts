// Sổ lượt mẫu (ADR 0011): doanh nghiệp demo dùng gói Theo lượt – 50 lượt tặng, một lần mua qua PayOS, mỗi tờ khai đã khai chính thức trừ 1 lượt;
// doanh nghiệp mẫu của khu Quản trị: số dư / hợp đồng để các mục "Cần chú ý" và báo cáo doanh thu có dữ liệu. Toàn bộ là GIẢ.
import type { CustomsResult, Organization } from "@kb/contracts";
import type { MockBilling, MockLedgerEntry } from "../billing-types";
import { ADMIN_ORG_BILLING } from "./admin";
import { isoDay, isoTime } from "./core";

const PRICE = "25000";
const sys = "system";

export function seedBilling(db: { org: Pick<Organization, "id">; customsResults: Pick<CustomsResult, "dossierId" | "declarationNo" | "channel" | "updatedAt">[] }): MockBilling {
  const ledger: MockLedgerEntry[] = [];
  const orgId = db.org.id;
  const row = (e: Omit<MockLedgerEntry, "amountVnd" | "unitPriceVnd" | "dossierId" | "branch" | "declarationNo" | "paymentId" | "note"> & Partial<MockLedgerEntry>): MockLedgerEntry => ({
    amountVnd: "0", unitPriceVnd: "0", dossierId: null, branch: null, declarationNo: null, paymentId: null, note: null, ...e,
  });
  ledger.push(row({ id: `grant:demo:${orgId}`, orgId, at: isoTime(-24 * 60), delta: 50, reason: "GRANT", note: "Tặng 50 lượt dữ liệu mẫu", createdBy: sys }));
  const payment = {
    id: "pay_demo_1", orgId, provider: "PAYOS" as const, orderCode: 1_730_000_000_123, credits: 20, amountVnd: "500000", status: "PAID" as const,
    checkoutUrl: null, createdAt: isoTime(-24 * 20 - 0.2), paidAt: isoTime(-24 * 20),
  };
  ledger.push(row({ id: `payos:${payment.orderCode}`, orgId, at: payment.paidAt, delta: 20, reason: "PURCHASE", amountVnd: "500000", unitPriceVnd: PRICE, paymentId: payment.id, note: "Mua 20 lượt qua PayOS (mã đơn 1730000000123)", createdBy: sys }));
  // Mỗi tờ khai mẫu đã khai chính thức (có phân luồng) → 1 lượt CHARGE lúc khai chính thức.
  for (const r of db.customsResults) {
    if (!r.declarationNo || !r.channel) continue;
    ledger.push(row({
      id: `charge:${orgId}:${r.declarationNo}`, orgId, at: r.updatedAt ?? isoTime(-24), delta: -1, reason: "CHARGE", amountVnd: PRICE, unitPriceVnd: PRICE,
      dossierId: r.dossierId, branch: 1, declarationNo: r.declarationNo, note: "IDC được chấp nhận", createdBy: sys,
    }));
  }
  const contracts: MockBilling["contracts"] = {};
  for (const o of ADMIN_ORG_BILLING) {
    ledger.push(row({ id: `grant:migrate:${o.id}`, orgId: o.id, at: isoTime(-24 * Math.min(o.createdDays, 45)), delta: o.plan === "PAYG" ? 3 : 0, reason: "GRANT", note: o.plan === "PAYG" ? "Tặng 3 lượt khi chuyển sang gói Theo lượt" : "Chuyển sang gói Hợp đồng năm", createdBy: sys }));
    for (let i = 0; i < o.declared; i++) {
      const no = `10${o.id.length}${String(4_000_000 + i * 37 + o.createdDays).padStart(9, "0")}`;
      ledger.push(row({
        id: `charge:${o.id}:${no}`, orgId: o.id, at: isoTime(-6 - i * 9), delta: o.plan === "PAYG" ? -1 : 0, reason: o.plan === "PAYG" ? "CHARGE" : "CONTRACT_USE",
        amountVnd: o.plan === "PAYG" ? PRICE : "0", unitPriceVnd: o.plan === "PAYG" ? PRICE : "0", declarationNo: no, note: "IDC được chấp nhận", createdBy: sys,
      }));
    }
    if (o.plan === "PAYG") {
      // Nạp tay để số dư cuối = o.credits (3 lượt tặng − số tờ đã khai + nạp).
      const topup = o.credits - 3 + o.declared;
      if (topup > 0) ledger.push(row({ id: `adj:seed:${o.id}`, orgId: o.id, at: isoTime(-24 * 30), delta: topup, reason: "MANUAL_TOPUP", amountVnd: String(topup * 25_000), unitPriceVnd: PRICE, note: "Chuyển khoản theo hóa đơn", createdBy: "stf_bao" }));
      else if (topup < 0) ledger.push(row({ id: `adj:seed:${o.id}`, orgId: o.id, at: isoTime(-24 * 30), delta: topup, reason: "ADJUST", note: "Điều chỉnh số dư", createdBy: "stf_bao" }));
    } else {
      contracts[o.id] = { contractNo: `HĐ-${o.id.slice(4).toUpperCase()}-2026`, startsOn: isoDay(-344), ...(o.contractEndsIn !== null ? { endsOn: isoDay(o.contractEndsIn) } : {}), valueVnd: "144000000", note: "Hợp đồng năm, thanh toán 2 đợt" };
    }
  }
  return { ledger: ledger.sort((a, b) => b.at.localeCompare(a.at)), payments: [payment], contracts };
}
