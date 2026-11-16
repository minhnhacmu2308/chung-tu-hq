// @vitest-environment jsdom
// Bước Khai báo: 3 nhóm trạng thái trên thẻ, "Mở lại để sửa" khi chưa tờ nào có số, "Xác nhận tờ khai đã hủy" theo vai trò.
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SubmissionView } from "@kb/contracts";
import { getDb, resetDb } from "@/mocks/db";
import { expectNoA11yViolations, renderWithProviders } from "@/test/dom";
import { branch, pipelineFor, submissionOf } from "@/test/branch-submission";
import { SubmitStep } from "./submit-step";

const api = vi.hoisted(() => ({ current: null as SubmissionView | null, reopen: vi.fn(), cancel: vi.fn(), sessionDone: false }));
vi.mock("@/api/session", async (orig) => {
  const real = await orig<typeof import("@/api/session")>();
  return { ...real, getSession: async () => { const r = await real.getSession(); api.sessionDone = true; return r; } };
});
vi.mock("@/api/customs", async (orig) => ({ ...(await orig<typeof import("@/api/customs")>()), getSubmission: async () => api.current! }));
vi.mock("@/api/declaration", async (orig) => ({
  ...(await orig<typeof import("@/api/declaration")>()),
  reopenDeclaration: (...a: unknown[]) => api.reopen(...a),
  confirmDeclarationCancelled: (...a: unknown[]) => api.cancel(...a),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/dossiers/dos_028",
  useSearchParams: () => new URLSearchParams(),
}));

const T = { timeout: 5000 };
const dossier = () => getDb().dossiers.find((d) => d.id === "dos_028")!;
const setRole = (role: string) => {
  const db = getDb();
  (db.members.find((m) => m.id === db.currentUserId) as { role: string }).role = role;
};
const sending = pipelineFor("NOT_SENT").map((r) => (r.op === "IDA" ? { ...r, status: "SENDING" as const } : r));

beforeEach(() => {
  resetDb();
  setRole("APPROVER");
  api.sessionDone = false;
  api.reopen.mockReset().mockResolvedValue(undefined);
  api.cancel.mockReset().mockResolvedValue(undefined);
});

describe("Bước Khai báo – mở lại để sửa", () => {
  it("chưa tờ nào có số → nút hiện, bấm xác nhận gọi reopen rồi về Review; a11y", async () => {
    api.current = submissionOf([branch(1, 2, "NOT_SENT"), branch(2, 2, "NOT_SENT")]);
    const goTo = vi.fn();
    const { container } = renderWithProviders(<SubmitStep dossier={dossier()} goTo={goTo} />);
    await userEvent.click(await screen.findByRole("button", { name: "Mở lại để sửa" }, T));
    const dlg = await screen.findByRole("dialog");
    await expectNoA11yViolations(container);
    await userEvent.click(within(dlg).getByRole("button", { name: "Mở lại để sửa" }));
    await waitFor(() => expect(api.reopen).toHaveBeenCalledWith("dos_028"), T);
    await waitFor(() => expect(goTo).toHaveBeenCalledWith("review"), T);
  }, 20_000);

  it("đang gửi → không hiện", async () => {
    api.current = submissionOf([branch(1, 2, "NOT_SENT", { pipeline: sending, sending: true }), branch(2, 2, "NOT_SENT")]);
    renderWithProviders(<SubmitStep dossier={dossier()} goTo={vi.fn()} />);
    await screen.findByRole("region", { name: /^Tờ 1\/2/ }, T);
    expect(screen.queryByRole("button", { name: "Mở lại để sửa" })).toBeNull();
  }, 20_000);

  it("có tờ đã có số → không hiện", async () => {
    api.current = submissionOf([branch(1, 2, "PRE_DECLARED"), branch(2, 2, "NOT_SENT")]);
    renderWithProviders(<SubmitStep dossier={dossier()} goTo={vi.fn()} />);
    await screen.findByRole("region", { name: /^Tờ 1\/2/ }, T);
    expect(screen.queryByRole("button", { name: "Mở lại để sửa" })).toBeNull();
  }, 20_000);
});

describe("Bước Khai báo – xác nhận tờ khai đã hủy", () => {
  it("APPROVER: tờ có số chưa thông quan có nút; xác nhận gửi {branch, reason, date}; a11y", async () => {
    api.current = submissionOf([branch(1, 2, "DECLARED"), branch(2, 2, "CLEARED")]);
    renderWithProviders(<SubmitStep dossier={dossier()} goTo={vi.fn()} />);
    const c1 = await screen.findByRole("region", { name: /^Tờ 1\/2/ }, T);
    expect(within(screen.getByRole("region", { name: /^Tờ 2\/2/ })).queryByRole("button", { name: /Xác nhận tờ khai đã hủy/ })).toBeNull();
    await userEvent.click(await within(c1).findByRole("button", { name: "Xác nhận tờ khai đã hủy – tờ 1" }, T));
    const dlg = await screen.findByRole("dialog");
    await expectNoA11yViolations(dlg);
    const confirm = within(dlg).getByRole("button", { name: "Xác nhận đã hủy" }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    const select = await within(dlg).findByRole("combobox", { name: /Lý do hủy/ }, T);
    await userEvent.click(select);
    await userEvent.click((await screen.findAllByRole("option", { name: /·/ }, T))[0]!);
    await waitFor(() => expect(confirm.disabled).toBe(false));
    await userEvent.click(confirm);
    await waitFor(() => expect(api.cancel).toHaveBeenCalledTimes(1), T);
    const [id, input] = api.cancel.mock.calls[0]!;
    expect(id).toBe("dos_028");
    expect(input).toMatchObject({ branch: 1, reason: expect.any(String), date: new Date().toISOString().slice(0, 10) });
  }, 30_000);

  it("DECLARANT → không có nút hủy", async () => {
    setRole("DECLARANT");
    api.current = submissionOf([branch(1, 2, "DECLARED"), branch(2, 2, "DECLARED")]);
    renderWithProviders(<SubmitStep dossier={dossier()} goTo={vi.fn()} />);
    await screen.findByRole("region", { name: /^Tờ 1\/2/ }, T);
    await waitFor(() => expect(api.sessionDone).toBe(true), T);
    await act(async () => {});
    expect(screen.queryByRole("button", { name: /Xác nhận tờ khai đã hủy/ })).toBeNull();
  }, 20_000);

  it("tờ đã hủy hiện 'Đã hủy', không còn nút hủy", async () => {
    api.current = submissionOf([branch(1, 2, "CANCELLED"), branch(2, 2, "DECLARED")]);
    renderWithProviders(<SubmitStep dossier={dossier()} goTo={vi.fn()} />);
    const c1 = await screen.findByRole("region", { name: /^Tờ 1\/2/ }, T);
    expect(within(c1).getAllByText("Đã hủy").length).toBeGreaterThan(0);
    expect(within(c1).queryByRole("button", { name: /Xác nhận tờ khai đã hủy/ })).toBeNull();
  }, 20_000);

  it("tờ đã hủy: không còn việc tiếp theo 'đang chờ Hải quan', báo không còn nghiệp vụ", async () => {
    api.current = submissionOf([branch(1, 2, "CANCELLED"), branch(2, 2, "DECLARED")]);
    renderWithProviders(<SubmitStep dossier={dossier()} goTo={vi.fn()} />);
    const c1 = await screen.findByRole("region", { name: /^Tờ 1\/2/ }, T);
    expect(within(c1).getByText(/không còn nghiệp vụ nào để làm/)).toBeTruthy();
    expect(within(c1).queryByText("Đang chờ Hải quan")).toBeNull();
  }, 20_000);

  it("mở hộp hủy cho tờ 1, nhập, đóng, mở cho tờ 2 → form trống", async () => {
    api.current = submissionOf([branch(1, 2, "DECLARED"), branch(2, 2, "DECLARED")]);
    renderWithProviders(<SubmitStep dossier={dossier()} goTo={vi.fn()} />);
    const open = async (no: number) => {
      const c = await screen.findByRole("region", { name: new RegExp(`^Tờ ${no}/2`) }, T);
      await userEvent.click(await within(c).findByRole("button", { name: `Xác nhận tờ khai đã hủy – tờ ${no}` }, T));
      return screen.findByRole("dialog");
    };
    const d1 = await open(1);
    await userEvent.type(within(d1).getByPlaceholderText("Nhập số văn bản"), "CV-123");
    await userEvent.type(within(d1).getByPlaceholderText("Nhập ghi chú"), "ghi chú");
    await userEvent.click(within(d1).getByRole("button", { name: "Giữ lại" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), T);
    const d2 = await open(2);
    expect((within(d2).getByPlaceholderText("Nhập số văn bản") as HTMLInputElement).value).toBe("");
    expect((within(d2).getByPlaceholderText("Nhập ghi chú") as HTMLTextAreaElement).value).toBe("");
  }, 30_000);
});

describe("Bước Khai báo – sau khi hủy tờ khai", () => {
  const cancellation = { reason: "H01", date: "2026-10-20", docNo: "CV-9" };
  it("lô một tờ đã hủy: thẻ kết quả hiện lý do (mã + tên danh mục), ngày, số văn bản; không 'Đang chờ' / 'Có sau khi khai chính thức'; 'Đã hủy' không lặp ở mô tả", async () => {
    api.current = submissionOf([branch(1, 1, "CANCELLED", { cancellation })]);
    const { container } = renderWithProviders(<SubmitStep dossier={dossier()} goTo={vi.fn()} />);
    const result = (await screen.findByText("Kết quả từ Hải quan", undefined, T)).closest("[data-slot=card]") as HTMLElement ?? document.body;
    const reasonValue = await within(result).findByText(/^H01 – Tờ khai không còn giá trị/, undefined, T);
    // Tên lý do dài: ô giá trị xuống dòng (KeyValue wrap), không `shrink-0` – trước đây đẩy trang tràn ngang (390px: 720px).
    expect(reasonValue.className.split(" ")).not.toContain("shrink-0");
    expect(reasonValue.className.split(" ")).toEqual(expect.arrayContaining(["min-w-0", "break-words"]));
    expect(within(result).getByText("CV-9").className.split(" ")).not.toContain("shrink-0");
    expect(within(result).getByText("20/10/2026").className.split(" ")).toContain("shrink-0");
    expect(within(result).getByText("20/10/2026")).toBeTruthy();
    expect(screen.queryByText("Đang chờ")).toBeNull();
    expect(screen.queryByText("Có sau khi khai chính thức")).toBeNull();
    expect(screen.getByText(/^Đã hủy ngày 20\/10\/2026 · lý do H01/)).toBeTruthy();
    expect(screen.queryByText("Đã hủy", { selector: "p" })).toBeNull();
    await expectNoA11yViolations(container);
  }, 30_000);

  it("lô nhiều tờ: thẻ tờ đã hủy hiện thông tin hủy thay câu giai đoạn", async () => {
    api.current = submissionOf([branch(1, 2, "CANCELLED", { cancellation }), branch(2, 2, "DECLARED")]);
    renderWithProviders(<SubmitStep dossier={dossier()} goTo={vi.fn()} />);
    const c1 = await screen.findByRole("region", { name: /^Tờ 1\/2/ }, T);
    expect(await within(c1).findByText(/Đã hủy ngày 20\/10\/2026 · lý do H01.* · văn bản CV-9/, undefined, T)).toBeTruthy();
  }, 20_000);

  it("xác nhận hủy xong → làm mới cả HYS và bản khai bổ sung AMA", async () => {
    const spy = vi.spyOn(QueryClient.prototype, "invalidateQueries");
    api.current = submissionOf([branch(1, 2, "DECLARED"), branch(2, 2, "DECLARED")]);
    renderWithProviders(<SubmitStep dossier={dossier()} goTo={vi.fn()} />);
    const c1 = await screen.findByRole("region", { name: /^Tờ 1\/2/ }, T);
    await userEvent.click(await within(c1).findByRole("button", { name: "Xác nhận tờ khai đã hủy – tờ 1" }, T));
    const dlg = await screen.findByRole("dialog");
    await userEvent.click(await within(dlg).findByRole("combobox", { name: /Lý do hủy/ }, T));
    await userEvent.click((await screen.findAllByRole("option", { name: /·/ }, T))[0]!);
    spy.mockClear();
    await userEvent.click(within(dlg).getByRole("button", { name: "Xác nhận đã hủy" }));
    await waitFor(() => expect(api.cancel).toHaveBeenCalledTimes(1), T);
    await waitFor(() => {
      const keys = spy.mock.calls.map(([f]) => JSON.stringify((f as { queryKey?: unknown } | undefined)?.queryKey));
      expect(keys).toContain(JSON.stringify(["hys", "dos_028"]));
      expect(keys).toContain(JSON.stringify(["post-amendment", "dos_028"]));
    }, T);
    spy.mockRestore();
  }, 30_000);

  it("tờ đã khai chính thức rồi bị hủy (lô 1 tờ, có luồng): không còn chữ 'Có sau khi khai chính thức'", async () => {
    api.current = submissionOf([branch(1, 1, "CANCELLED", { channel: "GREEN", result: { declarationNo: "107624410321", channel: "GREEN", clearanceStatus: "WAITING" }, customsInfo: { receivedAt: "2026-11-10T03:00:00Z", declarationNo: "107624410321", exchangeRates: [], taxes: [], items: [], directives: [] } })]);
    renderWithProviders(<SubmitStep dossier={dossier()} goTo={vi.fn()} />);
    await screen.findByText(/không còn nghiệp vụ nào để làm/, {}, T);
    expect(screen.queryByText("Có sau khi khai chính thức")).toBeNull();
  }, 20_000);
});
