// @vitest-environment jsdom
// Thẻ "Qua khu vực giám sát" chạy trên mock thật (dos_029 NK container đã thông quan, dos_030 XK hàng lẻ đã thông quan):
// bảng điền sẵn từ vận đơn, sửa → Lưu; seal rỗng chặn Khai; xác nhận (DN + chi cục) → Đang gửi → Lấy phản hồi → chấp nhận;
// khối 2 khóa kèm lý do trước khi danh sách được chấp nhận; seal REJECT → lỗi dưới bảng đúng dòng; XK hàng lẻ; chỉ xem; axe.
// Khối 2 (KVGS) một bước: Lấy → đang lấy (thẻ tự làm mới) → chấp nhận "Lấy lúc …" / từ chối kèm lỗi; không "Lấy phản hồi", không số tham chiếu/tiếp nhận.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, resetDb } from "@/mocks/db";
import { expectNoA11yViolations, renderWithProviders } from "@/test/dom";
import { KvgsCard } from "./kvgs-card";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/dossiers/dos_029",
  useSearchParams: () => new URLSearchParams(),
}));

const T = { timeout: 8000 };
const cell = (col: string, n: number) => screen.getByRole("textbox", { name: `${col} – dòng ${n}` }) as HTMLInputElement;
const block = (name: string) => screen.getByRole("region", { name });

beforeEach(() => resetDb());

describe("KvgsCard – NK container (dos_029)", () => {
  it("điền sẵn từ vận đơn; sửa seal → nút Lưu bật; a11y", async () => {
    const { container } = renderWithProviders(<KvgsCard dossierId="dos_029" branch={1} canEdit />);
    await screen.findByRole("textbox", { name: "Số container – dòng 1" }, T);
    expect(cell("Số container", 1).value).toBe("TGHU0123450");
    expect(cell("Số seal", 1).value).toBe("KR884120");
    expect(cell("Số container", 2).value).toBe("MSKU7654328");
    const save = screen.getByRole("button", { name: "Lưu" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    await userEvent.type(cell("Số seal", 1), "9");
    expect(cell("Số seal", 1).value).toBe("KR8841209");
    expect(save.disabled).toBe(false);
    await expectNoA11yViolations(container);
  }, 30_000);

  it("seal rỗng → nút 'Khai DS container' khóa và ô báo lỗi", async () => {
    renderWithProviders(<KvgsCard dossierId="dos_029" branch={1} canEdit />);
    await screen.findByRole("textbox", { name: "Số seal – dòng 2" }, T);
    await waitFor(() => expect((screen.getByRole("button", { name: "Khai DS container" }) as HTMLButtonElement).disabled).toBe(false), T);
    await userEvent.clear(cell("Số seal", 2));
    expect(cell("Số seal", 2).getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText("Bắt buộc nhập")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Khai DS container" }) as HTMLButtonElement).disabled).toBe(true);
  }, 30_000);

  it("khối 2 khóa kèm lý do; gửi → xác nhận DN + chi cục → Đang gửi → Lấy phản hồi → chấp nhận → khối 2 mở", async () => {
    const dossier = getDb().dossiers.find((d) => d.id === "dos_029")!;
    renderWithProviders(<KvgsCard dossierId="dos_029" branch={1} canEdit customsOfficeName={dossier.customsOffice} />);
    await screen.findByRole("textbox", { name: "Số container – dòng 1" }, T);
    await waitFor(() => expect(within(block("Lấy DS qua KVGS")).getByText(/Khai danh sách container và chờ Hải quan chấp nhận/)).toBeTruthy(), T);
    expect((within(block("Lấy DS qua KVGS")).getByRole("button", { name: "Lấy DS qua KVGS" }) as HTMLButtonElement).disabled).toBe(true);

    const send = screen.getByRole("button", { name: "Khai DS container" });
    await waitFor(() => expect((send as HTMLButtonElement).disabled).toBe(false), T);
    await userEvent.click(send);
    const dialog = await screen.findByRole("dialog", { name: "Khai danh sách container với Hải quan?" }, T);
    expect(within(dialog).getByText(/^Doanh nghiệp khai: .+/)).toBeTruthy();
    expect(within(dialog).getByText(`Dữ liệu sẽ gửi tới: ${dossier.customsOffice}`)).toBeTruthy();
    await userEvent.click(within(dialog).getByRole("button", { name: "Gửi" }));

    const b1 = block("Khai danh sách container");
    expect(await within(b1).findByText("Đang gửi", {}, T)).toBeTruthy();
    // Đang gửi: bảng chỉ đọc.
    expect(screen.queryByRole("textbox", { name: "Số container – dòng 1" })).toBeNull();
    await userEvent.click(within(b1).getByRole("button", { name: "Lấy phản hồi – Khai danh sách container" }));
    expect(await within(b1).findByText("Hải quan chấp nhận", {}, T)).toBeTruthy();
    expect(within(b1).getByText("Số tiếp nhận")).toBeTruthy();
    expect(within(b1).getByRole("button", { name: "Sửa và khai lại" })).toBeTruthy();
    await waitFor(() => expect((within(block("Lấy DS qua KVGS")).getByRole("button", { name: "Lấy DS qua KVGS" }) as HTMLButtonElement).disabled).toBe(false), T);
  }, 40_000);

  it("seal REJECT1 ở dòng 1 → Hải quan từ chối, lỗi dưới bảng chỉ dòng 1", async () => {
    renderWithProviders(<KvgsCard dossierId="dos_029" branch={1} canEdit />);
    await screen.findByRole("textbox", { name: "Số seal – dòng 1" }, T);
    await userEvent.clear(cell("Số seal", 1));
    await userEvent.type(cell("Số seal", 1), "REJECT1");
    const send = screen.getByRole("button", { name: "Khai DS container" });
    await waitFor(() => expect((send as HTMLButtonElement).disabled).toBe(false), T);
    await userEvent.click(send);
    await userEvent.click(within(await screen.findByRole("dialog", {}, T)).getByRole("button", { name: "Gửi" }));
    const b1 = block("Khai danh sách container");
    await within(b1).findByText("Đang gửi", {}, T);
    await userEvent.click(within(b1).getByRole("button", { name: "Lấy phản hồi – Khai danh sách container" }));
    expect(await within(b1).findByText("Bị từ chối", {}, T)).toBeTruthy();
    const alert = (await screen.findByText(/Hải quan từ chối danh sách container \(1 lỗi\)/, {}, T)).closest("[role='alert'], [role='status'], div")!;
    expect(alert.textContent).toContain("Dòng 1:");
    expect(alert.textContent).not.toContain("Dòng 2:");
    // Bị từ chối → sửa được và khai lại.
    expect(screen.getByRole("textbox", { name: "Số seal – dòng 1" })).toBeTruthy();
  }, 40_000);

  it("vai trò chỉ xem: không có nút gửi / sửa, bảng chỉ đọc", async () => {
    renderWithProviders(<KvgsCard dossierId="dos_029" branch={1} canEdit={false} />);
    expect(await screen.findByText("TGHU0123450", {}, T)).toBeTruthy();
    expect(screen.getByText("Bạn chỉ có quyền xem và in bản kê.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Khai DS container" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Lấy DS qua KVGS" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Lưu" })).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  }, 30_000);
});

describe("KvgsCard – XK hàng lẻ (dos_030)", () => {
  it("không có khối 1, không có bảng; còn khối Lấy DS qua KVGS; a11y", async () => {
    const { container } = renderWithProviders(<KvgsCard dossierId="dos_030" branch={1} canEdit />);
    await screen.findByRole("region", { name: "Lấy DS qua KVGS" }, T);
    expect(screen.queryByRole("region", { name: "Khai danh sách container" })).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
    await waitFor(() => expect((screen.getByRole("button", { name: "Lấy DS qua KVGS" }) as HTMLButtonElement).disabled).toBe(false), T);
    expect((screen.getByRole("button", { name: "In bản kê" }) as HTMLButtonElement).disabled).toBe(true);
    await expectNoA11yViolations(container);
  }, 30_000);

  it("panel Lịch sử có nút Đóng ở cuối như các panel khác; bấm → panel đóng", async () => {
    renderWithProviders(<KvgsCard dossierId="dos_030" branch={1} canEdit />);
    await userEvent.click(await screen.findByRole("button", { name: "Lịch sử" }, T));
    const panel = await screen.findByRole("dialog", { name: "Lịch sử qua khu vực giám sát" }, T);
    const close = within(panel).getAllByRole("button", { name: "Đóng" });
    // Nút X ở đầu panel + nút "Đóng" ở cuối (DialogFooter).
    expect(close).toHaveLength(2);
    await userEvent.click(close.at(-1)!);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), T);
  }, 30_000);

  it("Lấy DS qua KVGS một bước: đang lấy (tự làm mới) → chấp nhận, 'Lấy lúc', không Lấy phản hồi / số tiếp nhận; In bật", async () => {
    renderWithProviders(<KvgsCard dossierId="dos_030" branch={1} canEdit />);
    const b2 = await screen.findByRole("region", { name: "Lấy DS qua KVGS" }, T);
    const fetchBtn = within(b2).getByRole("button", { name: "Lấy DS qua KVGS" }) as HTMLButtonElement;
    await waitFor(() => expect(fetchBtn.disabled).toBe(false), T);
    await userEvent.click(fetchBtn);
    await userEvent.click(within(await screen.findByRole("dialog", {}, T)).getByRole("button", { name: "Gửi" }));
    expect(await within(b2).findByText("Đang lấy danh sách từ Hải quan – thẻ tự làm mới.", {}, T)).toBeTruthy();
    expect(within(b2).getByRole("status")).toBeTruthy();
    expect(within(b2).queryByRole("button", { name: /Lấy phản hồi/ })).toBeNull();
    expect((within(b2).getByRole("button", { name: "Lấy DS qua KVGS" }) as HTMLButtonElement).disabled).toBe(true);
    expect(await within(b2).findByText("Hải quan chấp nhận", {}, T)).toBeTruthy();
    expect(within(b2).getByText(/^Lấy lúc .*\d{2}\/\d{2}\/\d{4}/)).toBeTruthy();
    expect(within(b2).queryByText("Số tham chiếu")).toBeNull();
    expect(within(b2).queryByText("Số tiếp nhận")).toBeNull();
    expect(within(b2).queryByText("Ngày tiếp nhận")).toBeNull();
    expect(within(b2).queryByRole("button", { name: /Lấy phản hồi/ })).toBeNull();
    expect(within(b2).getByRole("link", { name: "In bản kê" }).getAttribute("href")).toBe("/dossiers/dos_030/kvgs/1/print?mau=le");
  }, 30_000);

  it("KVGS bị từ chối → lỗi Hải quan, ghi chú xem lỗi, lấy lại được; không số tiếp nhận", async () => {
    getDb().kvgs.fetches.push({
      id: "kvf_rej", dossierId: "dos_030", branch: 1, status: "REJECTED", requestedAt: "2026-02-27T02:00:00Z", fetchedAt: null, doneAt: "2026-02-27T02:00:01Z",
      outcome: "REJECTED", refId: null, receiptNo: null, receiptDate: null, sheet: null,
      errors: [{ code: "000", message: "Không tìm thấy tờ khai", solution: "Kiểm tra số tờ khai" }],
    });
    renderWithProviders(<KvgsCard dossierId="dos_030" branch={1} canEdit />);
    const b2 = await screen.findByRole("region", { name: "Lấy DS qua KVGS" }, T);
    expect(within(b2).getByText("Bị từ chối")).toBeTruthy();
    expect(within(b2).getByText("Hải quan báo lỗi – xem lỗi bên dưới rồi lấy lại.")).toBeTruthy();
    expect(screen.getByText(/Hải quan báo lỗi khi lấy danh sách \(1 lỗi\)/)).toBeTruthy();
    expect(screen.getByText(/Không tìm thấy tờ khai/)).toBeTruthy();
    expect(within(b2).queryByText("Số tiếp nhận")).toBeNull();
    await waitFor(() => expect((within(b2).getByRole("button", { name: "Lấy DS qua KVGS" }) as HTMLButtonElement).disabled).toBe(false), T);
  }, 30_000);

  it("en / zh: tiêu đề và khối đã dịch", async () => {
    const en = renderWithProviders(<KvgsCard dossierId="dos_030" branch={1} canEdit />, "en");
    expect(await screen.findByRole("region", { name: "Fetch supervised-area list" }, T)).toBeTruthy();
    expect(screen.getByRole("region", { name: "Supervised-area passage" })).toBeTruthy();
    en.unmount();
    renderWithProviders(<KvgsCard dossierId="dos_030" branch={1} canEdit />, "zh");
    expect(await screen.findByRole("region", { name: "获取监管区清单" }, T)).toBeTruthy();
  }, 30_000);
});
