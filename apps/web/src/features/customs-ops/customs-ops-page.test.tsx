// @vitest-environment jsdom
// Màn Nghiệp vụ khác (mock): danh sách số định danh 3 trạng thái + a11y; lọc trạng thái ghi lên URL; chỉ dòng lỗi chọn được, Xóa gửi đúng id;
// hộp thoại đăng ký chặn số lượng ngoài 1–50.
import type { IdentifierRequest } from "@kb/contracts";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useSyncExternalStore } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "@/api/customs-ops";
import { getDb, resetDb } from "@/mocks/db";
import { expectNoA11yViolations, renderWithProviders } from "@/test/dom";
import { CustomsOpsPage } from "./customs-ops-page";

const nav = vi.hoisted(() => {
  let current = new URLSearchParams();
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    set: (qs: string) => {
      current = new URLSearchParams(qs);
      listeners.forEach((l) => l());
    },
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    replace: vi.fn(),
  };
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn(),
    replace: (url: string) => {
      nav.replace(url);
      nav.set(url.split("?")[1] ?? "");
    },
  }),
  usePathname: () => "/customs/ops",
  useSearchParams: () => useSyncExternalStore(nav.subscribe, nav.get),
}));

const T = { timeout: 8000 };
const REQ: IdentifierRequest = { objectType: "1", goodsType: "1", customsOffice: "03CE", taxCode: "0316789012", companyName: "AN PHÁT" };
const BATCH = "11111111-1111-4111-8111-111111111111";
const FAR = "2099-01-01T00:00:00.000Z";

/** 4 dòng một lô: có số (AVAILABLE), bị từ chối, chưa phản hồi, đang gửi. */
function seed() {
  const base = { dossierId: null, attempt: 1, request: REQ, refId: "ref_1", receiptNo: "119200000001", receiptDate: "2026-11-15", customsState: "11", identifiedOn: null, qrPng: null, resultText: null, errors: [], sentAt: "2026-11-15T03:00:00.000Z", doneAt: FAR, batchId: BATCH, usedByDossierId: null, usedAt: null, deletedAt: null };
  getDb().identifiers.push(
    { ...base, id: "idn_ok", batchIndex: 1, status: "ACCEPTED", customsState: "15", identifierNo: "122600000000001", identifiedOn: new Date().toISOString().slice(0, 10) },
    { ...base, id: "idn_rej", batchIndex: 2, status: "REJECTED", customsState: "10", identifierNo: null, receiptNo: "119200000002" },
    { ...base, id: "idn_nr", batchIndex: 3, status: "NO_RESPONSE", identifierNo: null, receiptNo: "119200000003" },
    { ...base, id: "idn_snd", batchIndex: 4, status: "SENDING", identifierNo: null, receiptNo: "119200000004" },
  );
}
const table = () => screen.findByRole("table", { name: "Số định danh hàng hóa" }, T);

beforeEach(() => {
  resetDb();
  nav.set("");
  nav.replace.mockReset();
  window.localStorage.clear();
});

describe("Nghiệp vụ khác – danh sách số định danh", () => {
  it("hiện các dòng với trạng thái (có số, bị từ chối, đang gửi); không vi phạm a11y", async () => {
    seed();
    const { container } = renderWithProviders(<CustomsOpsPage />);
    const tb = await table();
    const okRow = (await within(tb).findByText("122600000000001", {}, T)).closest("tr")!;
    expect(within(okRow).getByText("Có số – chưa dùng")).toBeTruthy();
    expect(within(tb).getByText("Bị từ chối")).toBeTruthy();
    expect(within(tb).getByText("Đang gửi")).toBeTruthy();
    expect(within(tb).getByText("Chưa phản hồi")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Đăng ký số định danh" })).toBeTruthy();
    await expectNoA11yViolations(container);
  }, 30_000);

  it("lọc trạng thái Bị từ chối → URL có status=REJECTED, chỉ còn dòng bị từ chối", async () => {
    seed();
    renderWithProviders(<CustomsOpsPage />);
    const tb = await table();
    await within(tb).findByText("122600000000001", {}, T);
    await userEvent.click(screen.getByRole("button", { name: "Bộ lọc" }));
    await userEvent.click(await screen.findByRole("combobox", { name: "Lọc theo Trạng thái" }, T));
    await userEvent.click(await screen.findByRole("option", { name: "Bị từ chối" }, T));
    expect(nav.replace).toHaveBeenLastCalledWith(expect.stringMatching(/^\/customs\/ops\?.*status=REJECTED/));
    await waitFor(() => expect(within(tb).queryByText("122600000000001")).toBeNull(), T);
    expect(within(tb).getAllByRole("row").filter((r) => within(r).queryByText("Bị từ chối"))).toHaveLength(1);
    expect(within(tb).queryByText("Đang gửi")).toBeNull();
  }, 30_000);

  it("ô Lô: gõ nhanh không ghi URL từng phím – ngừng gõ mới ghi một lần, đã cắt khoảng trắng", async () => {
    seed();
    renderWithProviders(<CustomsOpsPage />);
    const tb = await table();
    await within(tb).findByText("122600000000001", {}, T);
    await userEvent.click(screen.getByRole("button", { name: "Bộ lọc" }));
    const box = await screen.findByRole("textbox", { name: "Lô" }, T);
    nav.replace.mockClear();
    await userEvent.type(box, `  ${BATCH}  `);
    expect(nav.replace).not.toHaveBeenCalled();
    expect((box as HTMLInputElement).value).toBe(`  ${BATCH}  `);
    await waitFor(() => expect(nav.replace).toHaveBeenCalledTimes(1), T);
    expect(nav.replace).toHaveBeenCalledWith(`/customs/ops?batchId=${BATCH}`);
    expect(await within(tb).findByText("122600000000001", {}, T)).toBeTruthy();
  }, 30_000);

  it("URL có ngày sai / ô tìm quá dài → bỏ qua, danh sách vẫn hiện (không báo lỗi tải)", async () => {
    seed();
    nav.set(`from=2026-13-99&to=abc&status=REJECTED&q=${"1".repeat(80)}`);
    renderWithProviders(<CustomsOpsPage />);
    // Ô tìm cắt còn 50 ký tự (giới hạn API) → không khớp dòng nào, không phải lỗi tải.
    expect(await screen.findByText("Không có kết quả phù hợp", {}, T)).toBeTruthy();
    expect(screen.queryByText("Không tải được danh sách số định danh")).toBeNull();
    nav.set("from=2026-13-99&to=abc&status=REJECTED");
    expect(await within(await table()).findByText("Bị từ chối", {}, T)).toBeTruthy();
    expect(screen.queryByText("Không tải được danh sách số định danh")).toBeNull();
  }, 30_000);

  it("chỉ dòng lỗi chọn được; Xóa hỏi lại (cảnh báo dòng chưa phản hồi) rồi gửi đúng id", async () => {
    seed();
    const del = vi.spyOn(api, "deleteIdentifiers");
    renderWithProviders(<CustomsOpsPage />);
    const tb = await table();
    await within(tb).findByText("122600000000001", {}, T);
    const boxes = within(tb).getAllByRole("checkbox", { name: /^Chọn dòng/ });
    expect(boxes.map((b) => b.getAttribute("aria-label"))).toEqual(["Chọn dòng Lô 11111111 · STT 2", "Chọn dòng Lô 11111111 · STT 3"]);
    await userEvent.click(within(tb).getByRole("checkbox", { name: /Chọn tất cả/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Xóa 2 dòng lỗi" }, T));
    const dialog = await screen.findByRole("dialog", { name: "Xóa 2 dòng lỗi?" }, T);
    expect(within(dialog).getByText(/Có 1 dòng chưa phản hồi/)).toBeTruthy();
    await userEvent.click(within(dialog).getByRole("button", { name: "Xóa" }));
    await waitFor(() => expect(del).toHaveBeenCalledWith(["idn_rej", "idn_nr"]), T);
    await screen.findByText("Đã xóa 2 dòng", {}, T);
    await waitFor(() => expect(within(tb).queryByText("Bị từ chối")).toBeNull(), T);
  }, 30_000);

  it("không có dòng lỗi nào → không hiện cột chọn (kể cả ô Chọn tất cả)", async () => {
    seed();
    nav.set("status=AVAILABLE");
    renderWithProviders(<CustomsOpsPage />);
    const tb = await table();
    await within(tb).findByText("122600000000001", {}, T);
    expect(within(tb).queryAllByRole("checkbox")).toHaveLength(0);
  }, 30_000);

  it("Gửi lại có dòng chưa phản hồi → hỏi lại (cảnh báo phí FPT), đồng ý mới gửi", async () => {
    seed();
    const retry = vi.spyOn(api, "retryIdentifier");
    renderWithProviders(<CustomsOpsPage />);
    const tb = await table();
    await within(tb).findByText("122600000000001", {}, T);
    await userEvent.click(within(tb).getByRole("checkbox", { name: /Chọn tất cả/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Gửi lại 2 dòng" }, T));
    const dialog = await screen.findByRole("dialog", { name: "Gửi lại 2 dòng?" }, T);
    expect(within(dialog).getByText(/Có 1 dòng chưa phản hồi.*tính phí FPT/)).toBeTruthy();
    expect(retry).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole("button", { name: "Gửi lại" }));
    await waitFor(() => expect(retry.mock.calls.map((c) => c[0])).toEqual(["idn_rej", "idn_nr"]), T);
    await screen.findByText("Đã gửi lại 2 dòng", {}, T);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Gửi lại 2 dòng?" })).toBeNull(), T);
  }, 30_000);
});

describe("Nghiệp vụ khác – hộp thoại đăng ký", () => {
  it("chặn số lượng 0 và 51 (không gửi); 3 → gửi lô, đóng hộp thoại, báo đã gửi", async () => {
    seed();
    renderWithProviders(<CustomsOpsPage />);
    await within(await table()).findByText("122600000000001", {}, T);
    await userEvent.click(screen.getByRole("button", { name: "Đăng ký số định danh" }));
    const dialog = await screen.findByRole("dialog", { name: "Đăng ký số định danh" }, T);
    const count = within(dialog).getByRole("spinbutton", { name: /Số lượng/ });
    const before = getDb().identifiers.length;
    for (const n of ["0", "51"]) {
      await userEvent.clear(count);
      await userEvent.type(count, n);
      await userEvent.click(within(dialog).getByRole("button", { name: "Gửi đăng ký" }));
      expect(await within(dialog).findByText("Số lượng từ 1 đến 50")).toBeTruthy();
    }
    expect(getDb().identifiers.length).toBe(before);
    // Ô khai điền sẵn từ lần gửi trước.
    expect((within(dialog).getByRole("textbox", { name: /Mã số thuế$/ }) as HTMLInputElement).value).toBe("0316789012");
    await userEvent.clear(count);
    await userEvent.type(count, "3");
    await userEvent.click(within(dialog).getByRole("button", { name: "Gửi đăng ký" }));
    await screen.findByText("Đã gửi đăng ký 3 số định danh", {}, T);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Đăng ký số định danh" })).toBeNull(), T);
    expect(getDb().identifiers.length).toBe(before + 3);
  }, 30_000);
});
