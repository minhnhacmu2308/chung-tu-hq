// @vitest-environment jsdom
// Bước Review theo phạm vi sửa (lô 3 tờ, chỉ gọi về một số tờ): chỉ tiêu chung khóa + nút gọi về các tờ còn lại, dòng tờ chưa gọi về chỉ đọc,
// cảnh báo 1.51 đổi so với tờ đã khai; gọi về tất cả → form đầy đủ như cũ.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SubmissionView } from "@kb/contracts";
import { getDb, resetDb } from "@/mocks/db";
import { expectNoA11yViolations, renderWithProviders } from "@/test/dom";
import { branch, submissionOf } from "@/test/branch-submission";
import { ReviewStep } from "./review-step";

const nav = vi.hoisted(() => ({ query: "step=review", replace: vi.fn() }));
const api = vi.hoisted(() => ({ current: null as SubmissionView | null, recallAll: vi.fn(), fetches: 0 }));
vi.mock("@/api/customs", async (orig) => {
  const real = await orig<typeof import("@/api/customs")>();
  return { ...real, getSubmission: async () => (api.fetches++, api.current!), recallAllSheets: (...a: unknown[]) => api.recallAll(...a) };
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: nav.replace, back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/dossiers/dos_028",
  useSearchParams: () => new URLSearchParams(nav.query),
}));

const T = { timeout: 30_000 };
const dossier = () => getDb().dossiers.find((d) => d.id === "dos_028")!;
// Truy vấn theo role trên cả trang in 120 dòng rất chậm → tìm hộp thoại / nút bằng DOM, thu hẹp bằng within.
const dialog = () => waitFor(() => { const d = document.querySelector<HTMLElement>("[role=dialog]"); if (!d) throw new Error("no dialog"); return d; }, T);
const cell = (id: string) => document.querySelector<HTMLElement>(`[data-print-cell="${id}"]`)!;
const partial = (over: Partial<SubmissionView> = {}) =>
  submissionOf([branch(1, 3, "PRE_DECLARED"), branch(2, 3, "RECALLED"), branch(3, 3, "PRE_DECLARED")], { declarationStatus: "DRAFT", ...over });

beforeEach(() => {
  resetDb();
  nav.query = "step=review";
  nav.replace.mockReset();
  api.fetches = 0;
  getDb().declarations.find((x) => x.dossierId === "dos_028")!.status = "DRAFT";
  api.recallAll.mockReset().mockResolvedValue({ sent: true, message: "ok", sheets: [1, 3] });
});

describe("ReviewStep – phạm vi sửa theo tờ đã gọi về", () => {
  it("chỉ tờ 2 gọi về: banner chỉ tiêu chung khóa; nút gọi về các tờ còn lại hỏi xác nhận rồi gọi recall-all; a11y", async () => {
    api.current = partial();
    const { container } = renderWithProviders(<ReviewStep dossier={dossier()} goTo={vi.fn()} />);
    expect(await screen.findByText("Thông tin chung: tờ 1, 3 chưa gọi về", {}, T)).toBeTruthy();
    await userEvent.click((await screen.findByText("Gọi về các tờ còn lại để sửa thông tin chung", {}, T)).closest("button")!);
    const dlg = await dialog();
    expect(api.recallAll).not.toHaveBeenCalled();
    await userEvent.click(within(dlg).getByRole("button", { name: "Gọi về tất cả tờ" }));
    expect(api.recallAll).toHaveBeenCalledWith("dos_028");
    await expectNoA11yViolations(container);
    // axe trên cả bản in 120 dòng: ~40 s khi chạy riêng, lâu hơn nhiều khi cả bộ test chạy song song.
  }, 300_000);

  it("dòng tờ 1 chỉ đọc kèm 'Tờ 1 – chưa gọi về'; dòng tờ 2 sửa được; ô chung chỉ đọc", async () => {
    api.current = partial();
    renderWithProviders(<ReviewStep dossier={dossier()} goTo={vi.fn()} />);
    await screen.findByText("Thông tin chung: tờ 1, 3 chưa gọi về", {}, T);
    await screen.findByText("Áp dụng cho cả 3 tờ khai", {}, T);
    // Tờ 1 (đang chọn): ghi chú dòng hàng chỉ đọc + panel dòng chỉ đọc.
    expect(screen.getByText("Tờ 1 – chưa gọi về: dòng hàng của tờ này chỉ đọc.")).toBeTruthy();
    await userEvent.click(cell("0:HAG_CMD"));
    let panel = await dialog();
    expect(within(panel).getByText("Tờ 1 – chưa gọi về")).toBeTruthy();
    expect(within(panel).queryByRole("button", { name: /^Lưu/ })).toBeNull();
    await userEvent.keyboard("{Escape}");
    // Ô chung (1.x) cũng chỉ đọc, lý do chỉ tiêu chung.
    await userEvent.click(cell(":TK_TP"));
    panel = await dialog();
    expect(within(panel).getByText("Thông tin chung: tờ 1, 3 chưa gọi về – gọi về tất cả tờ để sửa")).toBeTruthy();
    await userEvent.keyboard("{Escape}");
  }, 60_000);

  it("tờ 2 (?sheet=2) đã gọi về: không ghi chú khóa, dòng sửa được", async () => {
    nav.query = "step=review&sheet=2";
    api.current = partial();
    renderWithProviders(<ReviewStep dossier={dossier()} goTo={vi.fn()} />);
    await screen.findByText("Thông tin chung: tờ 1, 3 chưa gọi về", {}, T);
    await screen.findByText("Áp dụng cho cả 3 tờ khai", {}, T);
    expect(screen.queryByText(/Tờ 2 – chưa gọi về/)).toBeNull();
    await userEvent.click(cell("0:HAG_CMD"));
    const panel = await dialog();
    expect(within(panel).queryByText(/chưa gọi về/)).toBeNull();
    expect(within(panel).getByRole("button", { name: /^Lưu/ })).toBeTruthy();
  }, 60_000);

  it("sentChanges tờ 1 đổi 1.51 → cảnh báo phải gọi về tất cả tờ; chỉ tiêu chung khác → cảnh báo chung", async () => {
    api.current = submissionOf([branch(1, 3, "PRE_DECLARED", { sentChanges: { common: ["TK_TP"], lines: false } }), branch(2, 3, "RECALLED"), branch(3, 3, "PRE_DECLARED", { sentChanges: { common: ["TK_CN"], lines: false } })], { declarationStatus: "DRAFT" });
    renderWithProviders(<ReviewStep dossier={dossier()} goTo={vi.fn()} />);
    expect(await screen.findByText("1.51 đã đổi so với tờ đã khai – phải gọi về tất cả tờ", {}, T)).toBeTruthy();
    expect(screen.getByText(/Chỉ tiêu chung đã đổi so với tờ đã khai \(TK_CN\)/)).toBeTruthy();
  }, 60_000);

  it("mọi tờ RECALLED → không banner khóa, ô chung sửa được như cũ", async () => {
    api.current = submissionOf([branch(1, 3, "RECALLED"), branch(2, 3, "RECALLED"), branch(3, 3, "RECALLED")], { declarationStatus: "DRAFT" });
    renderWithProviders(<ReviewStep dossier={dossier()} goTo={vi.fn()} />);
    await screen.findByText("Áp dụng cho cả 3 tờ khai", {}, T);
    expect(screen.queryByText(/chưa gọi về/)).toBeNull();
    await userEvent.click(cell("0:HAG_CMD"));
    const panel = await dialog();
    expect(within(panel).getByRole("button", { name: /^Lưu/ })).toBeTruthy();
  }, 60_000);

  it("tiếng Anh", async () => {
    api.current = partial();
    renderWithProviders(<ReviewStep dossier={dossier()} goTo={vi.fn()} />, "en");
    expect(await screen.findByText("General information: sheets 1, 3 have not been recalled", {}, T)).toBeTruthy();
    expect(await screen.findByText("Recall the remaining sheets to edit general information", {}, T)).toBeTruthy();
  }, 60_000);

  it("tờ khai đã duyệt (lô 3 tờ): không có ghi chú 'chưa gọi về' sai", async () => {
    getDb().declarations.find((x) => x.dossierId === "dos_028")!.status = "APPROVED";
    api.current = submissionOf([branch(1, 3, "PRE_DECLARED"), branch(2, 3, "PRE_DECLARED"), branch(3, 3, "PRE_DECLARED")]);
    renderWithProviders(<ReviewStep dossier={dossier()} goTo={vi.fn()} />);
    await screen.findByText("Áp dụng cho cả 3 tờ khai", {}, T);
    expect(screen.queryByText(/chưa gọi về/)).toBeNull();
  }, 60_000);

  it("chỉ tờ 2 gọi về: việc cần xử lý (ô dòng hàng còn thiếu) tính ở tờ 2, không tính ở tờ 1", async () => {
    // Thiếu thành tiền (ô bắt buộc) ở một dòng tờ 1 và một dòng tờ 2: chỉ tờ 2 (đã gọi về) tính là việc cần xử lý.
    const lines = getDb().lineItems.filter((l) => l.dossierId === "dos_028").sort((a, b) => a.lineNo - b.lineNo);
    lines[5]!.amount = "";
    lines[55]!.amount = "";
    api.current = partial();
    renderWithProviders(<ReviewStep dossier={dossier()} goTo={vi.fn()} />);
    await screen.findByText("Áp dụng cho cả 3 tờ khai", {}, T);
    const labels = () => [...document.querySelectorAll<HTMLInputElement>("input[type=radio]")].map((r) => r.closest("label")!.textContent ?? "");
    // Số việc cần xử lý chỉ tính khi đã biết quyền sửa (phiên tải bất đồng bộ) → chờ, không khẳng định ngay sau lần vẽ đầu.
    await waitFor(() => expect(labels()[1]).toMatch(/\d+ việc cần xử lý/), T);
    expect(labels()[0]).not.toMatch(/việc cần xử lý/);
  }, 60_000);

  it("gọi về các tờ còn lại: đang chạy → nút khóa; chuỗi xong → phạm vi đầy đủ (hết banner khóa) không cần tải lại trang; ?recalled= thay bằng all:3", async () => {
    nav.query = "step=review&recalled=2";
    api.current = partial();
    api.recallAll.mockImplementation(async () => {
      api.current = submissionOf([branch(1, 3, "RECALLED"), branch(2, 3, "RECALLED"), branch(3, 3, "PRE_DECLARED", { inProgress: true })], { declarationStatus: "DRAFT" });
      return { sent: true, message: "ok", sheets: [1, 3] };
    });
    renderWithProviders(<ReviewStep dossier={dossier()} goTo={vi.fn()} />);
    expect(await screen.findByText("Đã gọi về tờ 2 – chỉ sửa dòng hàng của các tờ này; thông tin chung bị khóa", {}, T)).toBeTruthy();
    await userEvent.click((await screen.findByText("Gọi về các tờ còn lại để sửa thông tin chung", {}, T)).closest("button")!);
    await userEvent.click(within(await dialog()).getByRole("button", { name: "Gọi về tất cả tờ" }));
    expect(nav.replace).toHaveBeenCalledWith(expect.stringContaining("recalled=all%3A3"), { scroll: false });
    // Tờ 3 đang gọi về → nút gọi về các tờ còn lại bị khóa.
    const recallButton = () => screen.getByText("Gọi về các tờ còn lại để sửa thông tin chung").closest("button")!;
    await waitFor(() => expect(recallButton().disabled).toBe(true), T);
    // Chuỗi xong (Review tự hỏi lại mỗi giây) → mọi tờ đã gọi về, phạm vi đầy đủ.
    api.current = submissionOf([branch(1, 3, "RECALLED"), branch(2, 3, "RECALLED"), branch(3, 3, "RECALLED")], { declarationStatus: "DRAFT" });
    await waitFor(() => expect(screen.queryByText(/chưa gọi về/)).toBeNull(), T);
    expect(screen.queryByText(/Đã gọi về tờ 2 – chỉ sửa dòng hàng/)).toBeNull();
  }, 60_000);

  it("gọi về các tờ còn lại bị từ chối → tải lại bản truyền", async () => {
    api.current = partial();
    api.recallAll.mockRejectedValue(new Error("x"));
    renderWithProviders(<ReviewStep dossier={dossier()} goTo={vi.fn()} />);
    await userEvent.click((await screen.findByText("Gọi về các tờ còn lại để sửa thông tin chung", {}, T)).closest("button")!);
    const before = api.fetches;
    await userEvent.click(within(await dialog()).getByRole("button", { name: "Gọi về tất cả tờ" }));
    await waitFor(() => expect(api.fetches).toBeGreaterThan(before), T);
  }, 60_000);

  it("?recalled=2 nhưng không còn tờ khóa (mọi tờ đã gọi về) → không hiện thông báo phạm vi một phần", async () => {
    nav.query = "step=review&recalled=2";
    api.current = submissionOf([branch(1, 3, "RECALLED"), branch(2, 3, "RECALLED"), branch(3, 3, "RECALLED")], { declarationStatus: "DRAFT" });
    renderWithProviders(<ReviewStep dossier={dossier()} goTo={vi.fn()} />);
    await screen.findByText("Áp dụng cho cả 3 tờ khai", {}, T);
    expect(screen.queryByText(/Đã gọi về tờ 2/)).toBeNull();
  }, 60_000);

  it("?recalled=all:3 nhưng chuỗi dừng sớm (2 tờ đã gọi về) → thông báo theo số tờ thật trong bản truyền", async () => {
    nav.query = "step=review&recalled=all:3";
    api.current = submissionOf([branch(1, 3, "RECALLED"), branch(2, 3, "RECALLED"), branch(3, 3, "PRE_DECLARED")], { declarationStatus: "DRAFT" });
    renderWithProviders(<ReviewStep dossier={dossier()} goTo={vi.fn()} />);
    expect(await screen.findByText("Đã gọi về 2 tờ – sửa tờ khai rồi duyệt lại", {}, T)).toBeTruthy();
  }, 60_000);
});
