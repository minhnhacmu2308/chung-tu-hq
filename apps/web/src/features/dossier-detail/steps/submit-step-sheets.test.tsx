// @vitest-environment jsdom
// Bước Khai báo Hải quan theo tờ khai nhánh (lô > 50 dòng): mỗi tờ một thẻ (số tờ khai, giai đoạn, phân luồng, nút nghiệp vụ theo tờ, nhật ký);
// tờ chờ tờ trước "Chờ tờ k"; tờ lỗi ghi bằng chữ; lô 1 tờ giữ giao diện cũ.
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SubmissionView } from "@kb/contracts";
import { getDb, resetDb } from "@/mocks/db";
import { expectNoA11yViolations, renderWithProviders } from "@/test/dom";
import { branch, pipelineFor, submissionOf } from "@/test/branch-submission";
import { SubmitStep } from "./submit-step";

const api = vi.hoisted(() => ({ current: null as SubmissionView | null, perform: vi.fn(), resend: vi.fn() }));
vi.mock("@/api/customs", async (orig) => {
  const real = await orig<typeof import("@/api/customs")>();
  return {
    ...real,
    getSubmission: async () => api.current!,
    performOperation: (...a: unknown[]) => api.perform(...a),
    resendOperation: (...a: unknown[]) => api.resend(...a),
  };
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/dossiers/dos_028",
  useSearchParams: () => new URLSearchParams(),
}));

const T = { timeout: 5000 };
const dossier = () => getDb().dossiers.find((d) => d.id === "dos_028")!;
const card = (name: RegExp) => screen.getByRole("region", { name });

beforeEach(() => {
  resetDb();
  api.perform.mockReset().mockResolvedValue({ sent: true, message: "ok" });
  api.resend.mockReset().mockResolvedValue({ resent: true, message: "ok" });
});

describe("Bước Khai báo – lô 3 tờ", () => {
  it("3 thẻ 'Tờ k/3 – số tờ khai'; IDC trên thẻ 2 gọi nghiệp vụ tờ 2; chỉ tờ đã thông quan có nút sửa sau thông quan; a11y", async () => {
    api.current = submissionOf([
      branch(1, 3, "CLEARED"),
      branch(2, 3, "PRE_DECLARED", { nextOp: "IDC", pipeline: pipelineFor("PRE_DECLARED", ["IDC"]) }),
      branch(3, 3, "PRE_DECLARED"),
    ]);
    const goTo = vi.fn();
    const { container } = renderWithProviders(<SubmitStep dossier={dossier()} goTo={goTo} />);
    await screen.findByRole("region", { name: /^Tờ 1\/3 – 107624410321/ }, T);
    expect(card(/^Tờ 2\/3 – 107624410322/)).toBeTruthy();
    expect(card(/^Tờ 3\/3 – 107624410323/)).toBeTruthy();

    const c2 = card(/^Tờ 2\/3/);
    await userEvent.click(within(c2).getAllByRole("button", { name: /Khai chính thức \(IDC\)/ })[0]!);
    expect(api.perform).toHaveBeenCalledWith("dos_028", "IDC", 2);

    expect(within(card(/^Tờ 1\/3/)).getByRole("button", { name: "Sửa đổi sau thông quan" })).toBeTruthy();
    expect(within(c2).queryByRole("button", { name: "Sửa đổi sau thông quan" })).toBeNull();
    await userEvent.click(within(card(/^Tờ 1\/3/)).getByRole("button", { name: "Sửa đổi sau thông quan" }));
    expect(goTo).toHaveBeenCalledWith("post", { branch: 1 });
    await expectNoA11yViolations(container);
  }, 20_000);

  it("tờ lỗi gửi ghi bằng chữ; tờ sau 'Chờ tờ 2'; gửi lại trên thẻ lỗi gửi lại đúng tờ", async () => {
    const failed = pipelineFor("NOT_SENT").map((r) => (r.op === "IDA" ? { ...r, status: "ERROR" as const } : r));
    api.current = submissionOf([
      branch(1, 3, "PRE_DECLARED"),
      branch(2, 3, "NOT_SENT", { state: "SEND_FAILED", pipeline: failed, started: true }),
      branch(3, 3, "NOT_SENT"),
    ]);
    renderWithProviders(<SubmitStep dossier={dossier()} goTo={vi.fn()} />);
    await screen.findByRole("region", { name: /^Tờ 1\/3/ }, T);
    const c2 = card(/^Tờ 2\/3/);
    expect(within(c2).getByText("Lỗi gửi")).toBeTruthy();
    expect(within(card(/^Tờ 3\/3/)).getAllByText("Chờ tờ 2").length).toBeGreaterThan(0);
    expect(within(c2).queryByText(/Chờ tờ/)).toBeNull();
    await userEvent.click(within(c2).getAllByRole("button", { name: "Gửi lại IDA" })[0]!);
    expect(api.resend).toHaveBeenCalledWith("dos_028", "IDA", 2);
  }, 20_000);
});

describe("Bước Khai báo – lô 1 tờ", () => {
  it("giao diện như cũ: không có thẻ 'Tờ 1/1', tiêu đề tờ khai + số", async () => {
    api.current = submissionOf([branch(1, 1, "PRE_DECLARED", { nextOp: "IDC", pipeline: pipelineFor("PRE_DECLARED", ["IDC"]) })]);
    renderWithProviders(<SubmitStep dossier={dossier()} goTo={vi.fn()} />);
    await screen.findByText("Kết quả từ Hải quan", {}, T);
    expect(screen.queryByText(/Tờ 1\/1/)).toBeNull();
    await userEvent.click(screen.getAllByRole("button", { name: /Khai chính thức \(IDC\)/ })[0]!);
    expect(api.perform).toHaveBeenCalledWith("dos_028", "IDC", 1);
  }, 20_000);
});
