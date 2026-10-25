// @vitest-environment jsdom
// Bước Review theo phạm vi sửa (lô 3 tờ, chỉ gọi về một số tờ): chỉ tiêu chung khóa + nút gọi về các tờ còn lại, dòng tờ chưa gọi về chỉ đọc,
// cảnh báo 1.51 đổi so với tờ đã khai; gọi về tất cả → form đầy đủ như cũ.
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SubmissionView } from "@kb/contracts";
import { getDb, resetDb } from "@/mocks/db";
import { expectNoA11yViolations, renderWithProviders } from "@/test/dom";
import { branch, submissionOf } from "@/test/branch-submission";
import { ReviewStep } from "./review-step";

const nav = vi.hoisted(() => ({ query: "step=review" }));
const api = vi.hoisted(() => ({ current: null as SubmissionView | null, recallAll: vi.fn() }));
vi.mock("@/api/customs", async (orig) => {
  const real = await orig<typeof import("@/api/customs")>();
  return { ...real, getSubmission: async () => api.current!, recallAllSheets: (...a: unknown[]) => api.recallAll(...a) };
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/dossiers/dos_028",
  useSearchParams: () => new URLSearchParams(nav.query),
}));

const T = { timeout: 40_000 };
const dossier = () => getDb().dossiers.find((d) => d.id === "dos_028")!;
const cell = (id: string) => document.querySelector<HTMLElement>(`[data-print-cell="${id}"]`)!;
const partial = (over: Partial<SubmissionView> = {}) =>
  submissionOf([branch(1, 3, "PRE_DECLARED"), branch(2, 3, "RECALLED"), branch(3, 3, "PRE_DECLARED")], { declarationStatus: "DRAFT", ...over });

beforeEach(() => {
  resetDb();
  nav.query = "step=review";
  getDb().declarations.find((x) => x.dossierId === "dos_028")!.status = "DRAFT";
  api.recallAll.mockReset().mockResolvedValue({ sent: true, message: "ok", sheets: [1, 3] });
});

describe("ReviewStep – phạm vi sửa theo tờ đã gọi về", () => {
  it("chỉ tờ 2 gọi về: banner chỉ tiêu chung khóa; nút gọi về các tờ còn lại hỏi xác nhận rồi gọi recall-all; a11y", async () => {
    api.current = partial();
    const { container } = renderWithProviders(<ReviewStep dossier={dossier()} goTo={vi.fn()} />);
    expect(await screen.findByText("Thông tin chung: tờ 1, 3 chưa gọi về", {}, T)).toBeTruthy();
    await userEvent.click(await screen.findByRole("button", { name: "Gọi về các tờ còn lại để sửa thông tin chung" }, T));
    const dlg = await screen.findByRole("dialog");
    expect(api.recallAll).not.toHaveBeenCalled();
    await userEvent.click(within(dlg).getByRole("button", { name: "Gọi về tất cả tờ" }));
    expect(api.recallAll).toHaveBeenCalledWith("dos_028");
    await expectNoA11yViolations(container);
  }, 120_000);

  it("dòng tờ 1 chỉ đọc kèm 'Tờ 1 – chưa gọi về'; dòng tờ 2 sửa được; ô chung chỉ đọc", async () => {
    api.current = partial();
    renderWithProviders(<ReviewStep dossier={dossier()} goTo={vi.fn()} />);
    await screen.findByText("Thông tin chung: tờ 1, 3 chưa gọi về", {}, T);
    await screen.findByRole("radio", { name: /^Tờ 1\/3/ }, T);
    // Tờ 1 (đang chọn): ghi chú dòng hàng chỉ đọc + panel dòng chỉ đọc.
    expect(screen.getByText("Tờ 1 – chưa gọi về: dòng hàng của tờ này chỉ đọc.")).toBeTruthy();
    await userEvent.click(cell("0:HAG_CMD"));
    let panel = await screen.findByRole("dialog");
    expect(within(panel).getByText("Tờ 1 – chưa gọi về")).toBeTruthy();
    expect(within(panel).queryByRole("button", { name: /^Lưu/ })).toBeNull();
    await userEvent.keyboard("{Escape}");
    // Ô chung (1.x) cũng chỉ đọc, lý do chỉ tiêu chung.
    await userEvent.click(cell(":TK_TP"));
    panel = await screen.findByRole("dialog");
    expect(within(panel).getByText("Thông tin chung: tờ 1, 3 chưa gọi về – gọi về tất cả tờ để sửa")).toBeTruthy();
    await userEvent.keyboard("{Escape}");
  }, 120_000);

  it("tờ 2 (?sheet=2) đã gọi về: không ghi chú khóa, dòng sửa được", async () => {
    nav.query = "step=review&sheet=2";
    api.current = partial();
    renderWithProviders(<ReviewStep dossier={dossier()} goTo={vi.fn()} />);
    await screen.findByText("Thông tin chung: tờ 1, 3 chưa gọi về", {}, T);
    await screen.findByRole("radio", { name: /^Tờ 2\/3/ }, T);
    expect(screen.queryByText(/Tờ 2 – chưa gọi về/)).toBeNull();
    await userEvent.click(cell("0:HAG_CMD"));
    const panel = await screen.findByRole("dialog");
    expect(within(panel).queryByText(/chưa gọi về/)).toBeNull();
    expect(within(panel).getByRole("button", { name: /^Lưu/ })).toBeTruthy();
  }, 120_000);

  it("sentChanges tờ 1 đổi 1.51 → cảnh báo phải gọi về tất cả tờ; chỉ tiêu chung khác → cảnh báo chung", async () => {
    api.current = submissionOf([branch(1, 3, "PRE_DECLARED", { sentChanges: { common: ["TK_TP"], lines: false } }), branch(2, 3, "RECALLED"), branch(3, 3, "PRE_DECLARED", { sentChanges: { common: ["TK_CN"], lines: false } })], { declarationStatus: "DRAFT" });
    renderWithProviders(<ReviewStep dossier={dossier()} goTo={vi.fn()} />);
    expect(await screen.findByText("1.51 đã đổi so với tờ đã khai – phải gọi về tất cả tờ", {}, T)).toBeTruthy();
    expect(screen.getByText(/Chỉ tiêu chung đã đổi so với tờ đã khai \(TK_CN\)/)).toBeTruthy();
  }, 120_000);

  it("mọi tờ RECALLED → không banner khóa, ô chung sửa được như cũ", async () => {
    api.current = submissionOf([branch(1, 3, "RECALLED"), branch(2, 3, "RECALLED"), branch(3, 3, "RECALLED")], { declarationStatus: "DRAFT" });
    renderWithProviders(<ReviewStep dossier={dossier()} goTo={vi.fn()} />);
    await screen.findByRole("radio", { name: /^Tờ 1\/3/ }, T);
    expect(screen.queryByText(/chưa gọi về/)).toBeNull();
    await userEvent.click(cell("0:HAG_CMD"));
    const panel = await screen.findByRole("dialog");
    expect(within(panel).getByRole("button", { name: /^Lưu/ })).toBeTruthy();
  }, 120_000);

  it("tiếng Anh", async () => {
    api.current = partial();
    renderWithProviders(<ReviewStep dossier={dossier()} goTo={vi.fn()} />, "en");
    expect(await screen.findByText("General information: sheets 1, 3 have not been recalled", {}, T)).toBeTruthy();
    expect(await screen.findByText("Recall the remaining sheets to edit general information", {}, T)).toBeTruthy();
  }, 120_000);
});
