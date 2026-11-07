// @vitest-environment jsdom
// Khu Quản trị › doanh nghiệp (ADR 0011): "Điều chỉnh lượt" (số lượt ±, loại, ghi chú bắt buộc, lý do) và form "Hợp đồng năm" (bản mock).
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAdminOrg } from "@/api/admin";
import { adminLogin } from "@/mocks/admin/ops";
import { getDb, resetDb } from "@/mocks/db";
import { expectNoA11yViolations, renderWithProviders } from "@/test/dom";
import { OrgActionDialogs } from "./org-actions";

const T = { timeout: 5000 };
const balanceOf = (orgId: string) => getDb().billing.ledger.filter((l) => l.orgId === orgId).reduce((n, l) => n + l.delta, 0);

beforeEach(() => {
  resetDb();
  adminLogin(getDb(), "bao.hoang@khaibao-demo.vn", "matkhau");
});

describe("Điều chỉnh lượt", () => {
  it("bắt ghi chú + số lượt hợp lệ; nạp tay phải dương; lưu → thêm dòng sổ lượt + nhật ký; a11y", async () => {
    const orgId = getDb().org.id;
    const org = await getAdminOrg(orgId);
    const before = balanceOf(orgId);
    const onClose = vi.fn();
    renderWithProviders(<OrgActionDialogs org={org} action="credits" onClose={onClose} />);
    const dialog = await screen.findByRole("dialog", { name: "Điều chỉnh lượt" });
    const delta = within(dialog).getByRole("textbox", { name: /Số lượt/ });
    const note = within(dialog).getByRole("textbox", { name: /Ghi chú cho khách/ });
    const reason = within(dialog).getByRole("textbox", { name: /Lý do/ });
    expect(delta.getAttribute("placeholder")).toBe("Nhập số lượt, vd 10 hoặc -2");
    expect(note.getAttribute("placeholder")).toBeTruthy();

    // Nạp tay số âm + thiếu ghi chú → lỗi theo trường, không ghi gì.
    await userEvent.type(delta, "-5");
    await userEvent.type(reason, "Khách chuyển khoản");
    await userEvent.click(within(dialog).getByRole("button", { name: "Lưu điều chỉnh" }));
    expect(within(dialog).getByText("Nạp tay / Tặng phải là số dương")).toBeTruthy();
    expect(within(dialog).getByText("Nhập ghi chú (3–500 ký tự)")).toBeTruthy();
    expect(balanceOf(orgId)).toBe(before);
    await expectNoA11yViolations(dialog);

    await userEvent.clear(delta);
    await userEvent.type(delta, "15");
    await userEvent.type(within(dialog).getByRole("textbox", { name: /Số tiền tương ứng/ }), "375.000");
    await userEvent.type(note, "Chuyển khoản theo hóa đơn 0012");
    await userEvent.click(within(dialog).getByRole("button", { name: "Lưu điều chỉnh" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled(), T);
    expect(balanceOf(orgId)).toBe(before + 15);
    expect(getDb().billing.ledger.find((l) => l.orgId === orgId && l.note === "Chuyển khoản theo hóa đơn 0012")).toMatchObject({ reason: "MANUAL_TOPUP", delta: 15, amountVnd: "375000" });
    expect(getDb().admin.audit[0]).toMatchObject({ action: "ORG_CREDITS_ADJUSTED", reason: "Khách chuyển khoản" });
  }, 30_000);

  it("Điều chỉnh cho phép số âm", async () => {
    const orgId = getDb().org.id;
    const org = await getAdminOrg(orgId);
    const before = balanceOf(orgId);
    const onClose = vi.fn();
    renderWithProviders(<OrgActionDialogs org={org} action="credits" onClose={onClose} />);
    const dialog = await screen.findByRole("dialog", { name: "Điều chỉnh lượt" });
    await userEvent.click(within(dialog).getByRole("combobox", { name: /Loại/ }));
    await userEvent.click(await screen.findByRole("option", { name: "Điều chỉnh" }));
    await userEvent.type(within(dialog).getByRole("textbox", { name: /Số lượt/ }), "-2");
    await userEvent.type(within(dialog).getByRole("textbox", { name: /Ghi chú cho khách/ }), "Trừ lượt nạp nhầm");
    await userEvent.type(within(dialog).getByRole("textbox", { name: /Lý do/ }), "Nạp nhầm hôm qua");
    await userEvent.click(within(dialog).getByRole("button", { name: "Lưu điều chỉnh" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled(), T);
    expect(balanceOf(orgId)).toBe(before - 2);
  }, 30_000);
});

describe("Hợp đồng năm", () => {
  it("điền sẵn hợp đồng cũ; giá trị âm → lỗi; lưu số HĐ + giá trị + nhật ký; a11y", async () => {
    const target = getDb().admin.orgs.find((o) => o.org.plan.code === "CONTRACT")!;
    const orgId = target.org.id;
    const org = await getAdminOrg(orgId);
    const onClose = vi.fn();
    renderWithProviders(<OrgActionDialogs org={org} action="contract" onClose={onClose} />);
    const dialog = await screen.findByRole("dialog", { name: "Hợp đồng năm" });
    const no = within(dialog).getByRole("textbox", { name: /Số hợp đồng/ }) as HTMLInputElement;
    expect(no.value).toBe(getDb().billing.contracts[orgId]!.contractNo);
    const value = within(dialog).getByRole("textbox", { name: /Giá trị hợp đồng/ });
    expect(value.getAttribute("placeholder")).toBe("Nhập giá trị, vd 144000000");
    await expectNoA11yViolations(dialog);

    await userEvent.clear(no);
    await userEvent.type(no, "HĐ-99/2027");
    await userEvent.clear(value);
    await userEvent.type(value, "-1");
    await userEvent.type(within(dialog).getByRole("textbox", { name: /Lý do/ }), "Ký phụ lục gia hạn");
    await userEvent.click(within(dialog).getByRole("button", { name: "Lưu hợp đồng" }));
    expect(within(dialog).getByText("Nhập số tiền không âm, vd 144000000")).toBeTruthy();

    await userEvent.clear(value);
    await userEvent.type(value, "180.000.000");
    await userEvent.click(within(dialog).getByRole("button", { name: "Lưu hợp đồng" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled(), T);
    expect(getDb().billing.contracts[orgId]).toMatchObject({ contractNo: "HĐ-99/2027", valueVnd: "180000000" });
    expect(getDb().admin.audit[0]).toMatchObject({ action: "ORG_CONTRACT_UPDATED", reason: "Ký phụ lục gia hạn" });
  }, 30_000);
});
