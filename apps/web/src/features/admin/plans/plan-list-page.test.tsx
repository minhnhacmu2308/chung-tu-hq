// @vitest-environment jsdom
// Khu Quản trị › Gói dịch vụ (ADR 0011): 2 thẻ (Theo lượt – đơn giá/lượt, Hợp đồng năm – giá niêm yết / Liên hệ); hộp sửa theo loại gói.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { adminLogin } from "@/mocks/admin/ops";
import { getDb, resetDb } from "@/mocks/db";
import { expectNoA11yViolations, renderWithProviders } from "@/test/dom";
import { PlanListPage } from "./plan-list-page";

const T = { timeout: 5000 };

beforeEach(() => {
  resetDb();
  adminLogin(getDb(), "bao.hoang@khaibao-demo.vn", "matkhau");
});

const cardOf = (name: string) => screen.getByRole("heading", { name: new RegExp(name) }).closest("section")!;

describe("PlanListPage", () => {
  it("2 thẻ: Theo lượt hiện đơn giá/lượt, Hợp đồng năm hiện Liên hệ; a11y", async () => {
    const { container } = renderWithProviders(<PlanListPage />);
    await screen.findAllByRole("button", { name: "Sửa gói" }, T);
    expect(screen.getAllByRole("button", { name: "Sửa gói" })).toHaveLength(2);
    expect(within(cardOf("Theo lượt")).getByText("25.000 VND/lượt")).toBeTruthy();
    expect(within(cardOf("Hợp đồng năm")).getByText("Liên hệ")).toBeTruthy();
    await expectNoA11yViolations(container);
  }, 30_000);

  it("sửa gói Theo lượt: ô Đơn giá mỗi lượt (không có ô giá niêm yết), lưu đơn giá mới", async () => {
    renderWithProviders(<PlanListPage />);
    await screen.findAllByRole("button", { name: "Sửa gói" }, T);
    await userEvent.click(within(cardOf("Theo lượt")).getByRole("button", { name: "Sửa gói" }));
    const dialog = await screen.findByRole("dialog", { name: /Sửa gói Theo lượt/ });
    expect(within(dialog).queryByRole("textbox", { name: /Giá niêm yết/ })).toBeNull();
    const price = within(dialog).getByRole("textbox", { name: /Đơn giá mỗi lượt/ }) as HTMLInputElement;
    expect(price.value).toBe("25000");
    expect(price.getAttribute("placeholder")).toBe("Nhập đơn giá, vd 25000");
    await userEvent.clear(price);
    await userEvent.type(price, "abc");
    await userEvent.type(within(dialog).getByRole("textbox", { name: /Lý do/ }), "Điều chỉnh giá 2027");
    await userEvent.click(within(dialog).getByRole("button", { name: "Lưu gói" }));
    expect(within(dialog).getByText("Nhập số tiền, vd 25000")).toBeTruthy();
    await userEvent.clear(price);
    await userEvent.type(price, "30.000");
    await userEvent.click(within(dialog).getByRole("button", { name: "Lưu gói" }));
    await waitFor(() => expect(getDb().admin.plans.find((p) => p.code === "PAYG")?.pricePerDeclarationVnd).toBe("30000"), T);
  }, 30_000);

  it("sửa gói Hợp đồng năm: ô Giá niêm yết (0 = Liên hệ)", async () => {
    renderWithProviders(<PlanListPage />);
    await screen.findAllByRole("button", { name: "Sửa gói" }, T);
    await userEvent.click(within(cardOf("Hợp đồng năm")).getByRole("button", { name: "Sửa gói" }));
    const dialog = await screen.findByRole("dialog", { name: /Sửa gói Hợp đồng năm/ });
    expect(within(dialog).queryByRole("textbox", { name: /Đơn giá mỗi lượt/ })).toBeNull();
    const price = within(dialog).getByRole("textbox", { name: /Giá niêm yết/ });
    await userEvent.clear(price);
    await userEvent.type(price, "120000000");
    await userEvent.type(within(dialog).getByRole("textbox", { name: /Lý do/ }), "Niêm yết giá mới");
    await userEvent.click(within(dialog).getByRole("button", { name: "Lưu gói" }));
    await waitFor(() => expect(getDb().admin.plans.find((p) => p.code === "CONTRACT")?.priceVnd).toBe("120000000"), T);
  }, 30_000);
});
