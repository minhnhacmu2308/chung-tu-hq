// @vitest-environment jsdom
// Bước Review: "Mở lại để sửa" cũng hiện khi tờ khai đã truyền (SUBMITTED) nhưng chưa tờ nào có số và không tờ nào đang gửi.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SubmissionView } from "@kb/contracts";
import { getDb, resetDb } from "@/mocks/db";
import { expectNoA11yViolations, renderWithProviders } from "@/test/dom";
import { branch, pipelineFor, submissionOf } from "@/test/branch-submission";
import { ReviewStep } from "./review-step";

const api = vi.hoisted(() => ({ current: null as SubmissionView | null, reopen: vi.fn() }));
vi.mock("@/api/customs", async (orig) => ({ ...(await orig<typeof import("@/api/customs")>()), getSubmission: async () => api.current! }));
vi.mock("@/api/declaration", async (orig) => ({ ...(await orig<typeof import("@/api/declaration")>()), reopenDeclaration: (...a: unknown[]) => api.reopen(...a) }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/dossiers/dos_024",
  useSearchParams: () => new URLSearchParams("step=review"),
}));

// Hồ sơ nhỏ (2 dòng) để dựng nhanh khi cả bộ test chạy song song.
const T = { timeout: 20_000 };
const dossier = () => getDb().dossiers.find((d) => d.id === "dos_024")!;
const sendingRows = pipelineFor("NOT_SENT").map((r) => (r.op === "IDA" ? { ...r, status: "SENDING" as const } : r));

beforeEach(() => {
  resetDb();
  getDb().declarations.find((x) => x.dossierId === "dos_024")!.status = "SUBMITTED";
  api.reopen.mockReset().mockResolvedValue(undefined);
});

describe("ReviewStep – mở lại tờ khai đã truyền chưa có số", () => {
  it("chưa tờ nào có số, không gửi → nút hiện, bấm mở lại gọi reopen", async () => {
    api.current = submissionOf([branch(1, 1, "NOT_SENT")]);
    const { container } = renderWithProviders(<ReviewStep dossier={dossier()} goTo={vi.fn()} />);
    await userEvent.click(await screen.findByRole("button", { name: "Mở lại để sửa" }, T));
    const dlg = await screen.findByRole("dialog");
    await expectNoA11yViolations(container);
    await userEvent.click(within(dlg).getByRole("button", { name: "Mở lại tờ khai" }));
    await waitFor(() => expect(api.reopen).toHaveBeenCalledWith("dos_024"), T);
  }, 40_000);

  it("đang gửi → không hiện nút", async () => {
    api.current = submissionOf([branch(1, 1, "NOT_SENT", { pipeline: sendingRows, sending: true })]);
    renderWithProviders(<ReviewStep dossier={dossier()} goTo={vi.fn()} />);
    await screen.findAllByText("Tờ khai chỉ đọc", {}, T);
    expect(screen.queryByRole("button", { name: "Mở lại để sửa" })).toBeNull();
  }, 40_000);

  it("tờ đã có số → không hiện nút", async () => {
    api.current = submissionOf([branch(1, 1, "PRE_DECLARED")]);
    renderWithProviders(<ReviewStep dossier={dossier()} goTo={vi.fn()} />);
    await screen.findAllByText("Tờ khai chỉ đọc", {}, T);
    expect(screen.queryByRole("button", { name: "Mở lại để sửa" })).toBeNull();
  }, 40_000);
});
