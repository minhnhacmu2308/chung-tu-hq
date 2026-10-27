// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetDb } from "@/mocks/db";
import { expectNoA11yViolations, renderWithProviders } from "@/test/dom";
import { TeachPage } from "./teach-page";

let search = new URLSearchParams();
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace, back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/teach",
  useSearchParams: () => search,
}));

const T = { timeout: 5000 };
/** Dòng bảng (role=row) có chứa chữ – chờ tới khi bảng có dữ liệu. */
const rowWith = async (root: HTMLElement, text: string) => {
  const rows = await within(root).findAllByRole("row", {}, T);
  const hit = rows.find((r) => r.textContent?.includes(text));
  if (hit) return hit;
  return within(root).findByText(text, {}, T).then(() => within(root).getAllByRole("row").find((r) => r.textContent?.includes(text))!);
};

beforeEach(() => {
  resetDb();
  search = new URLSearchParams();
  replace.mockReset();
});

describe("Dạy khai báo", () => {
  it("tổng quan + tờ khai mẫu: chỉ số, tờ khai ghép hồ sơ, xem so sánh từng ô; không vi phạm a11y", async () => {
    const { container } = renderWithProviders(<TeachPage />);
    const table = await screen.findByRole("table", { name: "Danh sách tờ khai mẫu" }, T);
    const row = await rowWith(table, "106794645160");
    expect(within(row).getByText("HS-NK-2610-001")).toBeTruthy();
    expect(within(row).getByText(/81,5%|81.5%/)).toBeTruthy();
    expect(screen.getByText("Bài học chờ duyệt")).toBeTruthy();
    expect(screen.getByRole("switch", { name: "Dùng bài học khi dựng tờ khai nháp" })).toBeTruthy();
    await expectNoA11yViolations(container);

    await userEvent.click(within(row).getByRole("button", { name: "Xem so sánh – 106794645160" }));
    const dialog = await screen.findByRole("dialog", {}, T);
    const kho = await rowWith(dialog, "Mã địa điểm lưu kho hàng chờ thông quan dự kiến");
    expect(within(kho).getByText("02DSEA0 – KHO FEDEX")).toBeTruthy();
    expect(within(kho).getByText("Không có trên chứng từ")).toBeTruthy();
    expect(within(dialog).getByText(/Có trên Hóa đơn cước/)).toBeTruthy();
  }, 20_000);

  it("bài học: lọc chờ duyệt, hiện số lần gặp / tự điền, duyệt một bài học", async () => {
    search = new URLSearchParams("tab=lessons&status=PENDING");
    const { container } = renderWithProviders(<TeachPage />);
    const table = await screen.findByRole("table", { name: "Danh sách bài học" }, T);
    const row = await rowWith(table, "TTR");
    expect(within(row).getByText("1/3 – cần kiểm")).toBeTruthy();
    expect(within(row).getByText(/Nhà cung cấp LIGHTING RISE ZHUHAI/)).toBeTruthy();
    expect(within(table).getByText(/HS 9405.11.99/)).toBeTruthy();
    await expectNoA11yViolations(container);
    await userEvent.click(await within(row).findByRole("button", { name: /^Duyệt – / }, T));
    expect(await screen.findByText("Đã cập nhật bài học", {}, T)).toBeTruthy();
  }, 20_000);
});
