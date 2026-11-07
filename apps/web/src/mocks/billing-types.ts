// Kiểu dữ liệu gói & lượt của "DB" giả (ADR 0011) – tách riêng để db.ts, seed và billing-sim cùng dùng mà không vòng import.
import type { CreditLedgerEntry, Payment } from "@kb/contracts";

/** Hợp đồng năm của một doanh nghiệp gói CONTRACT (như org_contracts). */
export type MockContract = { contractNo?: string; startsOn?: string; endsOn?: string; valueVnd: string; note?: string };
export type MockLedgerEntry = CreditLedgerEntry & { orgId: string };
export type MockPayment = Payment & { orgId: string };
/** Sổ lượt + thanh toán + hợp đồng của MỌI doanh nghiệp (demo + doanh nghiệp mẫu của khu Quản trị). */
export type MockBilling = {
  ledger: MockLedgerEntry[]; payments: MockPayment[]; contracts: Record<string, MockContract>;
  /** Thanh toán online (cổng giả lập) bật/tắt – như PAYMENT_PROVIDER=fake / none của backend. Vắng = bật. */
  onlinePaymentEnabled?: boolean;
};
