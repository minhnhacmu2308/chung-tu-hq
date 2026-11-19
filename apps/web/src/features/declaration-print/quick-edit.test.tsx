// @vitest-environment jsdom
// Sửa nhanh tại ô trên bản in: bật công tắc → bấm ô chỉ chọn ô; gõ là nhập ngay trong ô; Enter / Tab chốt; Esc hủy; ô chưa lưu hiện
// trên ô + thanh nổi "Lưu N thay đổi"; ô phải qua panel (mã HS…) gõ thì mở panel.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetDb } from "@/mocks/db";
import { getDeclarationView } from "@/api/declaration";
import { getSubmission } from "@/api/customs";
import { expectNoA11yViolations, renderWithProviders } from "@/test/dom";
import { PrintDeclaration } from "./print-declaration";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/dossiers/dos_023",
  useSearchParams: () => new URLSearchParams(),
}));

const T = { timeout: 30_000 };
const cell = (id: string) => document.querySelector<HTMLElement>(`[data-print-cell="${id}"]`)!;

async function renderPrint(locale?: "en" | "zh") {
  const view = await getDeclarationView("dos_023");
  const submission = await getSubmission("dos_023");
  return renderWithProviders(
    <PrintDeclaration dossierId="dos_023" decl={view.declaration!} items={view.items} branches={view.branches} mode="FULL" canEdit submission={submission} />,
    locale,
  );
}

beforeEach(() => {
  resetDb();
  window.localStorage.removeItem("kb-print-quick-edit");
  // Bảng phím tắt tự mở lần đầu bật công tắc – các test khác coi như đã xem.
  window.localStorage.setItem("kb-print-quick-shortcuts-seen", "1");
});

describe("Sửa nhanh tại ô", () => {
  it("tắt (mặc định): bấm ô mở panel như cũ", async () => {
    await renderPrint();
    expect((screen.getByRole("switch", { name: "Sửa nhanh tại ô" }) as HTMLButtonElement).getAttribute("aria-checked")).toBe("false");
    await userEvent.click(cell(":TK_ENC"));
    expect(await screen.findByRole("dialog", undefined, T)).toBeTruthy();
  });

  it("nút Phím tắt chỉ hiện khi bật; lần đầu bật tự mở bảng phím tắt một lần, không còn khung Alert hướng dẫn", async () => {
    window.localStorage.removeItem("kb-print-quick-shortcuts-seen");
    const user = userEvent.setup();
    const { unmount } = await renderPrint();
    expect(screen.queryByRole("button", { name: "Phím tắt" })).toBeNull();
    await user.click(screen.getByRole("switch", { name: "Sửa nhanh tại ô" }));
    const dlg = await screen.findByRole("dialog", { name: "Phím tắt" }, T);
    expect(dlg.textContent).toContain("Phím tắt khi sửa nhanh tại ô");
    expect(dlg.textContent).toContain("Sửa giá trị đang có");
    expect(screen.queryByText(/^Bấm ô rồi gõ để nhập thẳng/)).toBeNull();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Phím tắt" })).toBeNull(), T);
    unmount();
    // Lần sau (công tắc đã nhớ là bật): không tự mở nữa, bấm nút mới mở.
    await renderPrint();
    const btn = await screen.findByRole("button", { name: "Phím tắt" }, T);
    expect(screen.queryByRole("dialog", { name: "Phím tắt" })).toBeNull();
    await user.click(btn);
    expect(await screen.findByRole("dialog", { name: "Phím tắt" }, T)).toBeTruthy();
  }, 120_000);

  it("bật: gõ thẳng vào ô 1.58, Enter chốt (chưa lưu), thanh nổi lưu một lần; không vi phạm a11y", async () => {
    const user = userEvent.setup();
    const { container } = await renderPrint();
    await user.click(screen.getByRole("switch", { name: "Sửa nhanh tại ô" }));
    expect(window.localStorage.getItem("kb-print-quick-edit")).toBe("1");

    await user.click(cell(":TK_ENC"));
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.keyboard("d");
    const input = screen.getByRole("textbox", { name: "1.58 Mã xác định thời hạn nộp thuế" });
    expect((input as HTMLInputElement).value).toBe("d");
    // Tên theo mã hiện ngay dưới ô.
    expect(await screen.findByText(/nộp thuế ngay/i, undefined, T)).toBeTruthy();
    await expectNoA11yViolations(container);
    await user.keyboard("{Enter}");

    expect(screen.queryByRole("textbox", { name: /1\.58/ })).toBeNull();
    expect(cell(":TK_ENC").textContent).toContain("D");
    expect(cell(":TK_ENC").textContent).toContain("Chưa lưu");
    const bar = screen.getByRole("group", { name: "Thay đổi chưa lưu trên bản in" });
    expect(within(bar).getByText("1 ô chưa lưu")).toBeTruthy();
    // Còn ô chưa lưu → chưa tắt được sửa nhanh.
    expect((screen.getByRole("switch", { name: "Sửa nhanh tại ô" }) as HTMLButtonElement).disabled).toBe(true);

    await user.click(within(bar).getByRole("button", { name: "Lưu 1 thay đổi" }));
    await waitFor(async () => {
      const view = await getDeclarationView("dos_023");
      expect(view.declaration!.fields.find((x) => x.code === "TK_ENC")?.value).toBe("D");
    }, T);
    await waitFor(() => expect(screen.queryByRole("group", { name: "Thay đổi chưa lưu trên bản in" })).toBeNull(), T);
  }, 120_000);

  it("Esc hủy phần đang gõ; Delete xóa ô; Hủy thay đổi bỏ hết", async () => {
    const user = userEvent.setup();
    await renderPrint();
    await user.click(screen.getByRole("switch", { name: "Sửa nhanh tại ô" }));
    await user.click(cell(":TK_IVD"));
    const before = cell(":TK_IVD").textContent;
    await user.keyboard("X{Escape}");
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(cell(":TK_IVD").textContent).toBe(before);

    cell(":TK_IVD").focus();
    await user.keyboard("{Delete}");
    expect(cell(":TK_IVD").textContent).toContain("Chưa lưu");
    await user.click(screen.getByRole("button", { name: "Hủy thay đổi" }));
    expect(cell(":TK_IVD").textContent).toBe(before);
  }, 120_000);

  it("ngày sai → báo lỗi, vẫn ở ô; ngày đúng dd/mm/yyyy → chốt", async () => {
    const user = userEvent.setup();
    await renderPrint();
    await user.click(screen.getByRole("switch", { name: "Sửa nhanh tại ô" }));
    await user.click(cell(":TK_IVD"));
    await user.keyboard("3");
    await user.keyboard("1/02/2026{Enter}");
    const input = screen.getByRole("textbox", { name: /Ngày phát hành/ });
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText("Ngày không hợp lệ – nhập dd/mm/yyyy")).toBeTruthy();
    await user.clear(input);
    await user.type(input, "01/10/2026{Enter}");
    expect(cell(":TK_IVD").textContent).toContain("01/10/2026");
    expect(cell(":TK_IVD").textContent).toContain("Chưa lưu");
  }, 120_000);

  it("mã không có trong danh mục: Enter / Tab báo đỏ và ở lại ô; bấm ra ngoài → bỏ giá trị, ô báo đỏ, không vào danh sách lưu", async () => {
    const user = userEvent.setup();
    await renderPrint();
    await user.click(screen.getByRole("switch", { name: "Sửa nhanh tại ô" }));
    // Chờ danh mục DUE_DATE tải xong (gõ mã đúng thấy tên) rồi mới thử mã sai.
    await user.click(cell(":TK_ENC"));
    await user.keyboard("d");
    await screen.findByText(/nộp thuế ngay/i, undefined, T);
    await user.keyboard("{Backspace}Z{Tab}");
    const input = screen.getByRole("textbox", { name: "1.58 Mã xác định thời hạn nộp thuế" });
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText(/Mã không có trong danh mục – nhập lại/)).toBeTruthy();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("textbox", { name: "1.58 Mã xác định thời hạn nộp thuế" })).toBeTruthy();

    await user.click(screen.getByRole("switch", { name: "Sửa nhanh tại ô" }).closest("label, div")!);
    expect(screen.queryByRole("textbox", { name: /1.58/ })).toBeNull();
    expect(cell(":TK_ENC").textContent).toContain('Mã "Z" không có trong danh mục');
    expect(within(cell(":TK_ENC")).getByRole("img", { name: "Có lỗi" })).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Thay đổi chưa lưu trên bản in" })).toBeNull();

    // Nhập lại mã đúng → hết đỏ, vào danh sách chờ lưu.
    await user.click(cell(":TK_ENC"));
    await user.keyboard("C{Enter}");
    expect(cell(":TK_ENC").textContent).not.toContain("không có trong danh mục");
    expect(screen.getByRole("group", { name: "Thay đổi chưa lưu trên bản in" })).toBeTruthy();
  }, 120_000);

  it("ô có danh mục: tooltip nhắc nhấp đúp mở danh mục; nhấp đúp mở panel", async () => {
    const user = userEvent.setup();
    await renderPrint();
    await user.click(screen.getByRole("switch", { name: "Sửa nhanh tại ô" }));
    await user.hover(cell(":TK_ENC"));
    expect((await screen.findAllByText(/Nhấp đúp để mở danh mục/, undefined, T)).length).toBeGreaterThan(0);
    await user.dblClick(cell(":TK_ENC"));
    expect(await screen.findByRole("dialog", undefined, T)).toBeTruthy();
  }, 120_000);

  it("ô phải qua panel (mã HS): gõ → mở panel", async () => {
    const user = userEvent.setup();
    await renderPrint();
    await user.click(screen.getByRole("switch", { name: "Sửa nhanh tại ô" }));
    await user.click(cell("0:HAG_CMD"));
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.keyboard("8");
    expect(await screen.findByRole("dialog", undefined, T)).toBeTruthy();
  }, 120_000);

  it("panel (tắt sửa nhanh): mã gõ tay không có trong danh mục (1.34 – A016) → ô đỏ, báo lỗi, nút Lưu khóa; sửa đúng → lưu được", async () => {
    const user = userEvent.setup();
    await renderPrint();
    await user.click(cell(":VD_PSC"));
    const dialog = await screen.findByRole("dialog", undefined, T);
    const input = within(dialog).getAllByRole("textbox").find((el) => (el as HTMLInputElement).value !== undefined && el.closest("[data-panel-field='VD_PSC']"))!;
    await user.clear(input);
    await user.type(input, "QQQQQ");
    await waitFor(() => expect(input.getAttribute("aria-invalid")).toBe("true"), T);
    expect(within(dialog).getByText("Có mã không nằm trong danh mục (ô viền đỏ) – sửa lại mới lưu được.")).toBeTruthy();
    const saveBtn = within(dialog).getAllByRole("button").find((b) => /^Lưu/.test(b.textContent ?? ""))!;
    expect((saveBtn as HTMLButtonElement).disabled).toBe(true);
    await user.clear(input);
    await user.type(input, "KRPUS");
    await waitFor(() => expect(input.getAttribute("aria-invalid")).toBeNull(), T);
  }, 120_000);

  it.each([
    ["en", "Quick edit in cells"],
    ["zh", "在格内快速编辑"],
  ] as const)("%s: công tắc đã dịch", async (locale, name) => {
    await renderPrint(locale);
    expect(screen.getByRole("switch", { name })).toBeTruthy();
  }, 60_000);
});
