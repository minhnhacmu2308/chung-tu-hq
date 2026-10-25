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

const api = vi.hoisted(() => ({ current: null as SubmissionView | null, perform: vi.fn(), resend: vi.fn(), declareAll: vi.fn() }));
vi.mock("@/api/customs", async (orig) => {
  const real = await orig<typeof import("@/api/customs")>();
  return {
    ...real,
    getSubmission: async () => api.current!,
    performOperation: (...a: unknown[]) => api.perform(...a),
    resendOperation: (...a: unknown[]) => api.resend(...a),
    declareAllSheets: (...a: unknown[]) => api.declareAll(...a),
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
  api.declareAll.mockReset().mockResolvedValue({ sent: true, message: "ok" });
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

  it("nút tra cứu theo tờ: tên truy cập bắt đầu bằng chữ hiển thị (WCAG 2.5.3)", async () => {
    api.current = submissionOf([branch(1, 3, "PRE_DECLARED"), branch(2, 3, "PRE_DECLARED"), branch(3, 3, "NOT_SENT")]);
    renderWithProviders(<SubmitStep dossier={dossier()} goTo={vi.fn()} />);
    await screen.findByRole("region", { name: /^Tờ 2\/3/ }, T);
    const btn = within(card(/^Tờ 2\/3/)).getByRole("button", { name: /^Tra cứu trạng thái \(IID\)/ });
    expect(btn.getAttribute("aria-label")).toBe("Tra cứu trạng thái (IID) – tờ 2");
  }, 20_000);

  it("tờ đang gửi rồi lỗi gửi → khối 'Nghiệp vụ của tờ' tự mở (không chỉ lúc gắn)", async () => {
    const sending = pipelineFor("NOT_SENT").map((r) => (r.op === "IDA" ? { ...r, status: "SENDING" as const } : r));
    const failed = pipelineFor("NOT_SENT").map((r) => (r.op === "IDA" ? { ...r, status: "ERROR" as const } : r));
    api.current = submissionOf([
      branch(1, 3, "PRE_DECLARED"),
      branch(2, 3, "NOT_SENT", { pipeline: sending, started: true, inProgress: true }),
      branch(3, 3, "NOT_SENT"),
    ]);
    renderWithProviders(<SubmitStep dossier={dossier()} goTo={vi.fn()} />);
    await screen.findByRole("region", { name: /^Tờ 2\/3/ }, T);
    const ops = () => within(card(/^Tờ 2\/3/)).getByRole("button", { name: /Nghiệp vụ của tờ/ });
    expect(ops().getAttribute("aria-expanded")).toBe("false");
    api.current = submissionOf([
      branch(1, 3, "PRE_DECLARED"),
      branch(2, 3, "NOT_SENT", { state: "SEND_FAILED", pipeline: failed, started: true }),
      branch(3, 3, "NOT_SENT"),
    ]);
    await within(card(/^Tờ 2\/3/)).findByText("Lỗi gửi", {}, T);
    expect(ops().getAttribute("aria-expanded")).toBe("true");
  }, 20_000);

  it("truyền lại sau gọi sửa: tờ đã thông quan ghi chú sửa chỉ tiêu chung qua AMA; tờ đã gọi về chờ tờ trước đang gửi lại; a11y", async () => {
    const sending = pipelineFor("AMEND_RECALLED").map((r) => (r.op === "IDA01" ? { ...r, status: "SENDING" as const } : r));
    api.current = submissionOf([
      branch(1, 3, "CLEARED"),
      branch(2, 3, "AMEND_RECALLED", { pipeline: sending, inProgress: true }),
      branch(3, 3, "RECALLED"),
    ], { declarationStatus: "SUBMITTED" });
    const { container } = renderWithProviders(<SubmitStep dossier={dossier()} goTo={vi.fn()} />);
    await screen.findByRole("region", { name: /^Tờ 1\/3/ }, T);
    expect(screen.getByText("Tờ 1 đã thông quan – chỉ tiêu chung sửa qua khai bổ sung (AMA)")).toBeTruthy();
    const c3 = card(/^Tờ 3\/3/);
    expect(within(c3).getAllByText("Chờ tờ 2").length).toBeGreaterThan(0);
    expect(within(c3).getByText("Tờ này tự gửi lại nội dung tờ khai sau khi tờ 2 gửi lại xong.")).toBeTruthy();
    expect(within(card(/^Tờ 2\/3/)).queryByText(/Chờ tờ/)).toBeNull();
    await expectNoA11yViolations(container);
  }, 20_000);
});

describe("Bước Khai báo – lô 3 tờ, tờ khai đã duyệt lại sau gọi về (APPROVED)", () => {
  it("tờ 2, 3 chờ tờ trước (truyền theo thứ tự tờ): nhãn 'Chờ tờ j', không có nút gửi chính, nút khai tạm trong nghiệp vụ khóa kèm lý do; tờ 1 gửi được; a11y", async () => {
    api.current = submissionOf([
      branch(1, 3, "RECALLED", { nextOp: "IDA", pipeline: pipelineFor("RECALLED", ["IDA"]) }),
      branch(2, 3, "RECALLED", { nextOp: "IDA", pipeline: pipelineFor("RECALLED", ["IDA"]) }),
      branch(3, 3, "RECALLED", { nextOp: "IDA", pipeline: pipelineFor("RECALLED", ["IDA"]) }),
    ], { declarationStatus: "APPROVED" });
    const { container } = renderWithProviders(<SubmitStep dossier={dossier()} goTo={vi.fn()} />);
    await screen.findByRole("region", { name: /^Tờ 1\/3/ }, T);
    const c1 = card(/^Tờ 1\/3/);
    const c2 = card(/^Tờ 2\/3/);
    const c3 = card(/^Tờ 3\/3/);
    expect(within(c1).queryByText(/Chờ tờ/)).toBeNull();
    expect(within(c2).getAllByText("Chờ tờ 1").length).toBeGreaterThan(0);
    expect(within(c3).getAllByText("Chờ tờ 2").length).toBeGreaterThan(0);
    expect(within(c3).getByText("Tờ này tự gửi lại nội dung tờ khai sau khi tờ 2 gửi lại xong.")).toBeTruthy();
    await userEvent.click(within(c3).getByRole("button", { name: /Nghiệp vụ của tờ/ }));
    expect(within(c3).getByText("Tờ 3: chờ tờ 2 gửi nội dung trước – truyền theo thứ tự tờ khai")).toBeTruthy();
    // Dòng khóa không có nút; tờ 1 vẫn có nút khai tạm.
    expect(within(c3).queryByRole("button", { name: /\(IDA\)/ })).toBeNull();
    expect(within(c2).queryByRole("button", { name: /\(IDA\)/ })).toBeNull();
    expect(within(c1).getAllByRole("button", { name: /\(IDA\)/ }).length).toBeGreaterThan(0);
    await expectNoA11yViolations(container);
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

describe("Bước Khai báo – khai chính thức tất cả", () => {
  const openButton = () => screen.findByRole("button", { name: "Khai chính thức tất cả (3 tờ)" }, T);

  it("lô 3 tờ đã khai tạm: nút hiện → hộp xác nhận → xác nhận gọi declare-all; a11y", async () => {
    api.current = submissionOf([branch(1, 3, "PRE_DECLARED"), branch(2, 3, "PRE_DECLARED"), branch(3, 3, "PRE_DECLARED")]);
    const { container } = renderWithProviders(<SubmitStep dossier={dossier()} goTo={vi.fn()} />);
    await userEvent.click(await openButton());
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Gửi khai chính thức lần lượt 3 tờ theo thứ tự. Lỗi ở tờ nào sẽ dừng ở tờ đó.")).toBeTruthy();
    expect(api.declareAll).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
    await userEvent.click(within(dialog).getByRole("button", { name: /^Khai chính thức tất cả/ }));
    expect(api.declareAll).toHaveBeenCalledWith("dos_028");
  }, 20_000);

  it("tờ 1 đã gọi về (RECALLED) → nút ẩn", async () => {
    api.current = submissionOf([branch(1, 3, "RECALLED"), branch(2, 3, "PRE_DECLARED"), branch(3, 3, "PRE_DECLARED")]);
    renderWithProviders(<SubmitStep dossier={dossier()} goTo={vi.fn()} />);
    await screen.findByRole("region", { name: /^Tờ 1\/3/ }, T);
    expect(screen.queryByRole("button", { name: /Khai chính thức tất cả/ })).toBeNull();
  }, 20_000);

  it("lô một tờ → nút ẩn", async () => {
    api.current = submissionOf([branch(1, 1, "PRE_DECLARED", { nextOp: "IDC", pipeline: pipelineFor("PRE_DECLARED", ["IDC"]) })]);
    renderWithProviders(<SubmitStep dossier={dossier()} goTo={vi.fn()} />);
    await screen.findAllByRole("button", { name: /Khai chính thức \(IDC\)/ }, T);
    expect(screen.queryByRole("button", { name: /Khai chính thức tất cả/ })).toBeNull();
  }, 20_000);
});
