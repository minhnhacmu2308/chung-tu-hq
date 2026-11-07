// @vitest-environment jsdom
// Bước Truyền tờ khai × gói (ADR 0011 §6.2): dòng "lô này dùng N lượt", thiếu lượt → Alert + Mua lượt + khóa nút Ký số,
// hợp đồng hết hạn → khóa, ân hạn → cảnh báo nhưng vẫn gửi được, lỗi máy chủ INSUFFICIENT_CREDITS → cùng Alert.
import type { SubmissionView } from "@kb/contracts";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api-error";
import { getDb, resetDb } from "@/mocks/db";
import { isoDay } from "@/mocks/seed/core";
import { branch, pipelineFor, submissionOf } from "@/test/branch-submission";
import { expectNoA11yViolations, renderWithProviders } from "@/test/dom";
import { SubmitStep } from "./submit-step";

const api = vi.hoisted(() => ({ current: null as SubmissionView | null, submit: vi.fn() }));
vi.mock("@/api/customs", async (orig) => {
  const real = await orig<typeof import("@/api/customs")>();
  return {
    ...real,
    getSubmission: async () => api.current!,
    submitDeclaration: (...a: unknown[]) => api.submit(...a),
    listCertificates: async () => [{ id: "cert_1", subject: "CÔNG TY MẪU", issuer: "VNPT-CA", serial: "540100000000000001", validTo: "2099-12-31", isDefault: true }],
  };
});
// Tờ khai mẫu không có ô bắt buộc trống – bước này chỉ kiểm phần gói.
vi.mock("@/api/declaration", async (orig) => {
  const real = await orig<typeof import("@/api/declaration")>();
  return { ...real, getDeclarationView: async () => ({ declaration: null, items: [], branches: [] }) };
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/dossiers/dos_014",
  useSearchParams: () => new URLSearchParams(),
}));

const T = { timeout: 5000 };
const dossier = () => getDb().dossiers.find((d) => d.id === "dos_014")!;
const signButton = () => screen.findByRole("button", { name: /Ký số & khai tạm \(IDA\)/ }, T);

/** Lô `of` tờ, chưa gửi lần nào, tờ khai đã duyệt. */
function firstSend(of = 1): SubmissionView {
  const pipeline = pipelineFor("NOT_SENT", ["IDA"]);
  const sheets = Array.from({ length: of }, (_, i) => branch(i + 1, of, "NOT_SENT", { nextOp: "IDA", pipeline }));
  return submissionOf(sheets, { declarationStatus: "APPROVED", ...(of === 1 ? { branches: [] } : {}) });
}

/** Số dư sổ lượt của doanh nghiệp demo về đúng `n` (dòng điều chỉnh). */
function setBalance(n: number) {
  const db = getDb();
  const balance = db.billing.ledger.filter((l) => l.orgId === db.org.id).reduce((s, l) => s + l.delta, 0);
  db.billing.ledger.unshift({
    id: "adj_test", orgId: db.org.id, at: new Date().toISOString(), delta: n - balance, reason: "ADJUST", amountVnd: "0", unitPriceVnd: "0",
    dossierId: null, branch: null, declarationNo: null, paymentId: null, note: "Kiểm thử", createdBy: "stf_bao",
  });
}

function setContract(endsInDays: number) {
  const db = getDb();
  db.org.plan = { ...db.org.plan, code: "CONTRACT" };
  db.billing.contracts[db.org.id] = { contractNo: "HĐ-T", endsOn: isoDay(endsInDays), valueVnd: "0" };
}

beforeEach(() => {
  resetDb();
  api.submit.mockReset().mockResolvedValue({ sent: true, message: "ok" });
});

describe("Bước Truyền tờ khai – lượt khai (Theo lượt)", () => {
  it("đủ lượt: dòng 'Lô này dùng 1 lượt … còn X lượt khả dụng', nút Ký số bấm được", async () => {
    setBalance(20);
    api.current = firstSend();
    renderWithProviders(<SubmitStep dossier={dossier()} goTo={vi.fn()} />);
    const btn = await signButton();
    expect(await screen.findByText(/khi Hải quan chấp nhận khai chính thức · còn \d+ lượt khả dụng/, undefined, T)).toBeTruthy();
    expect(screen.getByText("1 lượt").tagName).toBe("STRONG");
    expect((btn as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText("Không đủ lượt để truyền tờ khai")).toBeNull();
  }, 20_000);

  it("lô 3 tờ thiếu lượt: Alert danger 'cần 3 lượt', nút Mua lượt về Cài đặt › Gói, khóa Ký số; a11y", async () => {
    setBalance(2);
    api.current = firstSend(3);
    const { container } = renderWithProviders(<SubmitStep dossier={dossier()} goTo={vi.fn()} />);
    expect(await screen.findByText("Không đủ lượt để truyền tờ khai", undefined, T)).toBeTruthy();
    expect(screen.getByText(/Lô này cần 3 lượt, còn \d+ lượt khả dụng/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Mua lượt" }).getAttribute("href")).toBe("/settings?tab=plan");
    expect(((await signButton()) as HTMLButtonElement).disabled).toBe(true);
    await expectNoA11yViolations(container);
  }, 30_000);

  it("máy chủ trả INSUFFICIENT_CREDITS → hiện cùng Alert", async () => {
    setBalance(20);
    api.current = firstSend();
    api.submit.mockRejectedValue(new ApiError("INSUFFICIENT_CREDITS", "Không đủ lượt", 402, { reason: "INSUFFICIENT_CREDITS", params: { needed: 2, available: 1 } }));
    renderWithProviders(<SubmitStep dossier={dossier()} goTo={vi.fn()} />);
    await userEvent.click(await signButton());
    await waitFor(() => expect(api.submit).toHaveBeenCalled(), T);
    expect(await screen.findByText("Không đủ lượt để truyền tờ khai", undefined, T)).toBeTruthy();
    expect(screen.getByText(/Lô này cần 2 lượt, còn 1 lượt khả dụng/)).toBeTruthy();
  }, 20_000);
});

describe("Bước Truyền tờ khai – Hợp đồng năm", () => {
  it("hết hạn quá 7 ngày ân hạn: Alert 'Hợp đồng đã hết hạn', khóa Ký số", async () => {
    setContract(-10);
    api.current = firstSend();
    renderWithProviders(<SubmitStep dossier={dossier()} goTo={vi.fn()} />);
    expect(await screen.findByText("Hợp đồng đã hết hạn", undefined, T)).toBeTruthy();
    expect(((await signButton()) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("link", { name: "Xem gói" })).toBeTruthy();
  }, 20_000);

  it("ân hạn: cảnh báo, vẫn gửi được; không có dòng lượt", async () => {
    setContract(-3);
    api.current = firstSend();
    renderWithProviders(<SubmitStep dossier={dossier()} goTo={vi.fn()} />);
    expect(await screen.findByText("Hợp đồng đang trong thời gian ân hạn", undefined, T)).toBeTruthy();
    expect(((await signButton()) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText(/khi Hải quan chấp nhận khai chính thức · còn/)).toBeNull();
  }, 20_000);

  it("en: Alert đã dịch", async () => {
    setContract(-10);
    api.current = firstSend();
    renderWithProviders(<SubmitStep dossier={dossier()} goTo={vi.fn()} />, "en");
    expect(await screen.findByText("Contract expired", undefined, T)).toBeTruthy();
  }, 20_000);
});
