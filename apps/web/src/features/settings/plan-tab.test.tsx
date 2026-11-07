// @vitest-environment jsdom
// Cài đặt › Gói & sử dụng (ADR 0011): PAYG (số dư, mua lượt, lịch sử), CONTRACT (hợp đồng), quay lại từ PayOS (PAID / PENDING / CANCELLED).
import type { Payment } from "@kb/contracts";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { simulatePaymentPaid, startCreditPurchase } from "@/api/billing";
import { getDb, resetDb } from "@/mocks/db";
import { isoDay } from "@/mocks/seed/core";
import { expectNoA11yViolations, renderWithProviders } from "@/test/dom";
import { BuyCreditsDialog, PAYMENT_POLL_MS, PaymentReturn, PlanTab } from "./plan-tab";

const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), params: "tab=plan" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace, back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/settings",
  useSearchParams: () => new URLSearchParams(nav.params),
}));
/** `sync`: thay kết quả đồng bộ thanh toán (mặc định: mock thật – cổng giả lập giữ PENDING như backend). */
const billing = vi.hoisted(() => ({ sync: null as null | ((id: string) => Promise<Payment>), syncCalls: 0 }));
vi.mock("@/api/billing", async (orig) => {
  const real = await orig<typeof import("@/api/billing")>();
  return {
    ...real,
    syncPayment: (id: string) => {
      billing.syncCalls++;
      return billing.sync ? billing.sync(id) : real.syncPayment(id);
    },
  };
});

const T = { timeout: 5000 };
const PAYMENT: Payment = {
  id: "pay_x", provider: "PAYOS", orderCode: 1_730_000_000_999, credits: 10, amountVnd: "250000", status: "PENDING", checkoutUrl: null, createdAt: "2026-11-07T01:00:00.000Z", paidAt: null,
};

beforeEach(() => {
  resetDb();
  nav.push.mockReset();
  nav.replace.mockReset();
  nav.params = "tab=plan";
  billing.sync = null;
  billing.syncCalls = 0;
});
afterEach(() => vi.useRealTimers());

describe("PlanTab – gói Theo lượt", () => {
  it("số dư khả dụng, đơn giá + định nghĩa lượt, lịch sử lượt và thanh toán; a11y", async () => {
    const { container } = renderWithProviders(<PlanTab />);
    expect(await screen.findByText(/^Còn \d+ lượt$/, undefined, T)).toBeTruthy();
    expect(screen.getByText(/25\.000 VND\/lượt · 1 lượt = 1 tờ khai được Hải quan chấp nhận khai chính thức/)).toBeTruthy();
    expect(await screen.findByRole("button", { name: "Mua lượt" }, T)).toBeTruthy();
    const ledger = screen.getByRole("table", { name: "Lịch sử lượt" });
    expect(within(ledger).getAllByText("Tặng").length).toBeGreaterThan(0);
    expect(within(ledger).getAllByText("+50").length).toBe(1);
    const payments = screen.getByRole("table", { name: "Thanh toán gần đây" });
    expect(within(payments).getByText("1730000000123")).toBeTruthy();
    expect(within(payments).getByText("Đã thanh toán")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Hai loại gói" })).toBeTruthy();
    await expectNoA11yViolations(container);
  }, 30_000);

  it("Khai báo viên không thấy nút Mua lượt", async () => {
    getDb().currentUserId = "usr_ha";
    renderWithProviders(<PlanTab />);
    expect(await screen.findByText("Chỉ Chủ sở hữu hoặc Quản trị mua được lượt.", undefined, T)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Mua lượt" })).toBeNull();
  }, 15_000);

  it("thanh toán online chưa bật (PAYMENT_PROVIDER=none) → không có Mua lượt, hướng dẫn liên hệ nạp lượt", async () => {
    getDb().billing.onlinePaymentEnabled = false;
    renderWithProviders(<PlanTab />);
    expect(await screen.findByText("Thanh toán online chưa bật – liên hệ KhaiBáo AI để nạp lượt.", undefined, T)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Mua lượt" })).toBeNull();
    await expect(startCreditPurchase({ credits: 5 })).rejects.toMatchObject({ code: "INTEGRATION_NOT_CONFIGURED", reason: "PAYMENT_NOT_CONFIGURED" });
  }, 15_000);

  it("còn ≤ 3 lượt → cảnh báo sắp hết lượt", async () => {
    const db = getDb();
    const balance = db.billing.ledger.filter((l) => l.orgId === db.org.id).reduce((n, l) => n + l.delta, 0);
    db.billing.ledger.unshift({ id: "adj_t", orgId: db.org.id, at: new Date().toISOString(), delta: 2 - balance, reason: "ADJUST", amountVnd: "0", unitPriceVnd: "0", dossierId: null, branch: null, declarationNo: null, paymentId: null, note: "Kiểm thử", createdBy: "stf_bao" });
    renderWithProviders(<PlanTab />);
    expect(await screen.findByText(/^(Sắp hết lượt|Đã hết lượt)$/, undefined, T)).toBeTruthy();
  }, 15_000);
});

describe("PlanTab – Hợp đồng năm", () => {
  it("thẻ hợp đồng: số HĐ, hiệu lực, trạng thái 'Sắp hết hạn · còn n ngày', liên hệ gia hạn; không có Mua lượt; a11y", async () => {
    const db = getDb();
    db.org.plan = { ...db.org.plan, code: "CONTRACT" };
    db.billing.contracts[db.org.id] = { contractNo: "HĐ-01/2026", startsOn: isoDay(-340), endsOn: isoDay(12), valueVnd: "120000000" };
    const { container } = renderWithProviders(<PlanTab />);
    expect(await screen.findByText("HĐ-01/2026", undefined, T)).toBeTruthy();
    expect(screen.getByText("Sắp hết hạn · còn 12 ngày")).toBeTruthy();
    expect(screen.getByText("Hợp đồng sắp hết hạn")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Liên hệ gia hạn" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Mua lượt" })).toBeNull();
    await expectNoA11yViolations(container);
  }, 30_000);

  it("hết hạn quá 7 ngày ân hạn → Alert hết hạn", async () => {
    const db = getDb();
    db.org.plan = { ...db.org.plan, code: "CONTRACT" };
    db.billing.contracts[db.org.id] = { contractNo: "HĐ-02", endsOn: isoDay(-10), valueVnd: "0" };
    renderWithProviders(<PlanTab />);
    expect(await screen.findByText("Hợp đồng đã hết hạn", undefined, T)).toBeTruthy();
    expect(screen.getByText("Hết hạn")).toBeTruthy();
  }, 15_000);
});

describe("BuyCreditsDialog", () => {
  it("chọn nhanh / nhập số, tổng tiền theo đơn giá, biên 1–1000, chuyển sang trang thanh toán; a11y", async () => {
    renderWithProviders(<BuyCreditsDialog open onOpenChange={vi.fn()} unitPrice="25000" />);
    const dialog = await screen.findByRole("dialog", { name: "Mua lượt" });
    const total = within(dialog).getByRole("status", { name: "Tổng tiền" });
    expect(total.textContent).toBe("250.000 VND");
    await userEvent.click(within(dialog).getByRole("radio", { name: "50 lượt" }));
    expect(total.textContent).toBe("1.250.000 VND");
    const input = within(dialog).getByRole("textbox", { name: /Số lượt/ });
    expect(input.getAttribute("placeholder")).toBe("Nhập số lượt (1–1.000)");

    await userEvent.clear(input);
    await userEvent.type(input, "1001");
    await userEvent.click(within(dialog).getByRole("button", { name: "Thanh toán qua PayOS" }));
    expect(within(dialog).getByText("Nhập số nguyên từ 1 đến 1.000")).toBeTruthy();
    expect(total.textContent).toBe("—");
    await userEvent.clear(input);
    await userEvent.type(input, "0");
    expect(within(dialog).getByText("Nhập số nguyên từ 1 đến 1.000")).toBeTruthy();

    await userEvent.clear(input);
    await userEvent.type(input, "7");
    expect(total.textContent).toBe("175.000 VND");
    await expectNoA11yViolations(dialog);
    await userEvent.click(within(dialog).getByRole("button", { name: "Thanh toán qua PayOS" }));
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith(expect.stringMatching(/^\/settings\?tab=plan&payment=pay_\w+&fake=1$/)), T);
    const db = getDb();
    expect(db.billing.payments[0]).toMatchObject({ credits: 7, amountVnd: "175000", status: "PENDING" });
  }, 30_000);
});

describe("PaymentReturn (?payment=<id>)", () => {
  it("PAID → toast cộng lượt, làm mới và xóa query", async () => {
    const { paymentId } = await startCreditPurchase({ credits: 10 });
    // Webhook (giả lập) đã về trước khi khách quay lại trang → đồng bộ thấy PAID.
    await simulatePaymentPaid(paymentId);
    renderWithProviders(<PaymentReturn paymentId={paymentId} fake />);
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/settings?tab=plan", { scroll: false }), T);
    expect(await screen.findByText("Đã thanh toán – cộng 10 lượt", undefined, T)).toBeTruthy();
    expect(getDb().billing.payments.find((p) => p.id === paymentId)?.status).toBe("PAID");
  }, 15_000);

  it("PENDING → 'Đang chờ xác nhận', tự hỏi lại; cổng giả lập có nút 'Giả lập đã thanh toán'", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { paymentId } = await startCreditPurchase({ credits: 10 });
    billing.sync = async (id) => ({ ...PAYMENT, id });
    const { container } = renderWithProviders(<PaymentReturn paymentId={paymentId} fake />);
    expect(await screen.findByText("Đang chờ xác nhận thanh toán", undefined, T)).toBeTruthy();
    const calls = billing.syncCalls;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PAYMENT_POLL_MS + 50);
    });
    expect(billing.syncCalls).toBeGreaterThan(calls);
    await expectNoA11yViolations(container);
    vi.useRealTimers();
    await userEvent.click(screen.getByRole("button", { name: "Giả lập đã thanh toán" }));
    // Toast của Sonner giữ qua các test → chờ đúng kết quả (xóa query + đơn đã PAID) thay vì chỉ chờ chữ toast.
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/settings?tab=plan", { scroll: false }), T);
    expect(getDb().billing.payments.find((p) => p.id === paymentId)?.status).toBe("PAID");
    expect(await screen.findByText("Đã thanh toán – cộng 10 lượt", undefined, T)).toBeTruthy();
  }, 30_000);

  it("PENDING không phải cổng giả lập → không có nút giả lập", async () => {
    billing.sync = async (id) => ({ ...PAYMENT, id });
    renderWithProviders(<PaymentReturn paymentId="pay_x" fake={false} />);
    expect(await screen.findByText("Đang chờ xác nhận thanh toán", undefined, T)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Giả lập đã thanh toán" })).toBeNull();
  }, 15_000);

  it("CANCELLED → báo đã hủy, chưa cộng lượt; Đóng xóa query", async () => {
    billing.sync = async (id) => ({ ...PAYMENT, id, status: "CANCELLED" });
    renderWithProviders(<PaymentReturn paymentId="pay_x" fake={false} />);
    expect(await screen.findByText("Đã hủy thanh toán", undefined, T)).toBeTruthy();
    expect(screen.getByText(/Đơn 1730000000999 chưa được thanh toán nên chưa cộng lượt/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Đóng" }));
    expect(nav.replace).toHaveBeenCalledWith("/settings?tab=plan", { scroll: false });
  }, 15_000);

  it("en/zh: nhãn đã dịch", async () => {
    billing.sync = async (id) => ({ ...PAYMENT, id, status: "CANCELLED" });
    renderWithProviders(<PaymentReturn paymentId="pay_x" fake={false} />, "en");
    expect(await screen.findByText("Payment cancelled", undefined, T)).toBeTruthy();
  }, 15_000);
});
