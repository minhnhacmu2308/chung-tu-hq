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
    await waitFor(() => expect(dialog.querySelector("select")?.value).toBe("CONTRACT"), T);
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
    expect(getDb().billing.contracts[created.org.id]).toEqual({ contractNo: "HĐ-15", valueVnd: "0", note: "Phụ trách: Bảo" });
  }, 30_000);

  it("gói Theo lượt: ô Tặng lượt (không có ô hợp đồng); tặng 5 lượt → sổ lượt có 5 lượt tặng", async () => {
    renderWithProviders(<CreateOrgDialog open onOpenChange={vi.fn()} />);
    const dialog = await screen.findByRole("dialog", { name: "Tạo doanh nghiệp" });
    await waitFor(() => expect(dialog.querySelector("select")?.value).toBe("CONTRACT"), T);
    expect(within(dialog).getByRole("textbox", { name: /Giá trị hợp đồng/ })).toBeTruthy();
    await userEvent.click(within(dialog).getByRole("combobox", { name: /Gói dịch vụ/ }));
    await userEvent.click(await screen.findByRole("option", { name: "Theo lượt" }));
    expect(within(dialog).queryByRole("textbox", { name: /Giá trị hợp đồng/ })).toBeNull();
    const grant = within(dialog).getByRole("textbox", { name: /Tặng lượt/ });
    expect(grant.getAttribute("placeholder")).toBe("Nhập số lượt tặng, vd 3");
    await userEvent.type(within(dialog).getByRole("textbox", { name: /Mã số thuế/ }), "0109999999");
    await userEvent.type(within(dialog).getByRole("textbox", { name: /Tên doanh nghiệp/ }), "CÔNG TY THEO LƯỢT");
    await userEvent.type(within(dialog).getByRole("textbox", { name: /Họ tên/ }), "Lê Lượt");
    await userEvent.type(within(dialog).getByRole("textbox", { name: /Email đăng nhập/ }), "chu@theoluot.vn");
    await userEvent.type(grant, "abc");
    await userEvent.click(within(dialog).getByRole("button", { name: "Tạo doanh nghiệp" }));
    expect(within(dialog).getByText("Nhập số nguyên từ 0 đến 10.000")).toBeTruthy();
    await userEvent.clear(grant);
    await userEvent.type(grant, "5");
    await userEvent.click(within(dialog).getByRole("button", { name: "Tạo doanh nghiệp" }));
    expect(await within(dialog).findByText("Đã tạo doanh nghiệp", undefined, T)).toBeTruthy();
    const created = getDb().admin.orgs.find((o) => o.org.taxCode === "0109999999")!;
    expect(created.org.plan.code).toBe("PAYG");
    expect(getDb().billing.ledger.filter((l) => l.orgId === created.org.id)).toEqual([expect.objectContaining({ reason: "GRANT", delta: 5 })]);
    expect(getDb().billing.contracts[created.org.id]).toBeUndefined();
  }, 30_000);
});
