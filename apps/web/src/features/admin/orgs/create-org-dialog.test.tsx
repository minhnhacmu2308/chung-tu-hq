// @vitest-environment jsdom
// Tạo hộ doanh nghiệp (bản mock): báo lỗi theo trường, tạo xong hiện mật khẩu tạm một lần + doanh nghiệp có trong dữ liệu.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, resetDb } from "@/mocks/db";
import { adminLogin } from "@/mocks/admin/ops";
import { expectNoA11yViolations, renderWithProviders } from "@/test/dom";
import { CreateOrgDialog } from "./create-org-dialog";

const T = { timeout: 5000 };

beforeEach(() => {
  resetDb();
  adminLogin(getDb(), "bao.hoang@khaibao-demo.vn", "matkhau");
});

describe("CreateOrgDialog", () => {
  it("thiếu trường → lỗi theo trường; đủ → tạo, hiện email + mật khẩu tạm, doanh nghiệp có hợp đồng", async () => {
    renderWithProviders(<CreateOrgDialog open onOpenChange={vi.fn()} />);
    const dialog = await screen.findByRole("dialog", { name: "Tạo doanh nghiệp" });
    // Chờ danh sách gói tải xong (ô Gói dịch vụ là ô chọn duy nhất của form).
    await waitFor(() => expect(dialog.querySelector("select")?.value).toBe("BASIC"), T);
    await userEvent.click(within(dialog).getByRole("button", { name: "Tạo doanh nghiệp" }));
    expect(within(dialog).getByText("MST gồm 10 hoặc 13 chữ số")).toBeTruthy();
    expect(within(dialog).getByText("Nhập tên doanh nghiệp")).toBeTruthy();
    expect(within(dialog).getByText("Email không hợp lệ")).toBeTruthy();
    await expectNoA11yViolations(dialog);

    await userEvent.type(within(dialog).getByRole("textbox", { name: /Mã số thuế/ }), "0108888888");
    await userEvent.type(within(dialog).getByRole("textbox", { name: /Tên doanh nghiệp/ }), "CÔNG TY HỢP ĐỒNG");
    await userEvent.type(within(dialog).getByRole("textbox", { name: /Số hợp đồng/ }), "HĐ-15");
    await userEvent.type(within(dialog).getByRole("textbox", { name: /Họ tên/ }), "Đỗ Chủ");
    await userEvent.type(within(dialog).getByRole("textbox", { name: /Email đăng nhập/ }), "chu@hopdong.vn");
    await userEvent.type(within(dialog).getByRole("textbox", { name: /Ghi chú nội bộ/ }), "Phụ trách: Bảo");
    await userEvent.click(within(dialog).getByRole("button", { name: "Tạo doanh nghiệp" }));

    expect(await within(dialog).findByText("Đã tạo doanh nghiệp", undefined, T)).toBeTruthy();
    expect(within(dialog).getByText("chu@hopdong.vn")).toBeTruthy();
    expect(within(dialog).getByText(/^[A-Za-z2-9]{12}$/)).toBeTruthy();
    const created = getDb().admin.orgs.find((o) => o.org.taxCode === "0108888888")!;
    expect(created.org.name).toBe("CÔNG TY HỢP ĐỒNG");
    expect(created.meta.contract).toEqual({ contractNo: "HĐ-15", note: "Phụ trách: Bảo" });
  }, 30_000);
});
