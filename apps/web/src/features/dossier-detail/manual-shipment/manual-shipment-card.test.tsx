// @vitest-environment jsdom
// Khối nhập tay dữ liệu lô hàng (ADR 0013): trống → nhập; có dữ liệu → tóm tắt + sửa; lỗi theo ô; hồ sơ đã truyền chỉ xem; a11y.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { saveManualShipment } from "@/api/manual-shipment";
import { getDb, resetDb } from "@/mocks/db";
import { expectNoA11yViolations, renderWithProviders } from "@/test/dom";
import { ManualShipmentCard } from "./manual-shipment-card";

const T = { timeout: 20_000 };
const DOS = "dos_025";
const render = () => renderWithProviders(<ManualShipmentCard dossierId={DOS} currency="USD" incoterm="FOB" hasDocuments={false} />);

beforeEach(() => {
  resetDb();
  getDb().dossiers.find((d) => d.id === DOS)!.status = "DRAFT";
});

describe("ManualShipmentCard", () => {
  it("chưa có dữ liệu → nút Nhập dữ liệu; không vi phạm a11y", async () => {
    const { container } = render();
    expect(await screen.findByText("Chưa nhập dữ liệu", {}, T)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Nhập dữ liệu" })).toBeTruthy();
    await expectNoA11yViolations(container);
  }, 60_000);

  it("có dữ liệu → tóm tắt người mua, số dòng, tổng; sửa tên người mua rồi lưu; lỗi theo ô khi xóa tên hàng", async () => {
    await saveManualShipment(DOS, { buyer: { name: "NORDIC TOOLING GROUP AB" }, invoice: { incoterm: "FOB", currency: "USD" }, items: [{ description: "Drill bit 10mm", quantity: "1000", unit: "PCE", unitPrice: "1.255" }] });
    render();
    expect(await screen.findByText("NORDIC TOOLING GROUP AB", {}, T)).toBeTruthy();
    expect(screen.getByText("1 dòng")).toBeTruthy();
    expect(screen.getByText(/1[.,]255[.,]00/)).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Sửa dữ liệu" }));
    const dialog = await screen.findByRole("dialog", {}, T);
    expect(within(dialog).getByText(/Thành tiền/).textContent).toMatch(/1[.,]255[.,]00/);
    await expectNoA11yViolations(dialog);

    const desc = within(dialog).getByLabelText(/^Tên hàng/);
    await userEvent.clear(desc);
    await userEvent.click(within(dialog).getByRole("button", { name: "Lưu dữ liệu" }));
    expect(await within(dialog).findByText("Bắt buộc nhập")).toBeTruthy();
    expect(getDb().manualShipments[DOS]!.data.items[0]!.description).toBe("Drill bit 10mm");

    await userEvent.type(desc, "Drill bit 12mm");
    const buyer = within(dialog).getByLabelText("Tên người mua");
    await userEvent.clear(buyer);
    await userEvent.type(buyer, "NORDIC AB");
    await userEvent.click(within(dialog).getByRole("button", { name: "Lưu dữ liệu" }));
    expect(await screen.findByText("NORDIC AB", {}, T)).toBeTruthy();
    expect(getDb().manualShipments[DOS]!.data).toMatchObject({ buyer: { name: "NORDIC AB" }, items: [{ description: "Drill bit 12mm" }] });
  }, 90_000);

  it("chọn hàng từ danh mục: tìm theo mã kho viết khác ('dc 0001') → mã hàng = mã bộ XNK, gắn mặt hàng; chưa có mã XNK → để trống", async () => {
    render();
    await userEvent.click(await screen.findByRole("button", { name: "Nhập dữ liệu" }, T));
    const dialog = await screen.findByRole("dialog", {}, T);
    const pick = async (search: string, name: string) => {
      await userEvent.click(within(dialog).getByRole("combobox", { name: "Chọn từ danh mục hàng hóa" }));
      const box = await screen.findByPlaceholderText("Tìm kiếm…", {}, T);
      await userEvent.clear(box);
      await userEvent.type(box, search);
      await userEvent.click(await screen.findByRole("option", { name: new RegExp(name) }, T));
    };
    await pick("dc 0001", "Dây cáp điện CVV 3x2.5mm2");
    await waitFor(() => expect((within(dialog).getByLabelText("Mã hàng") as HTMLInputElement).value).toBe("CVV3X2.5"), T);
    expect((within(dialog).getByLabelText(/^Tên hàng/) as HTMLInputElement).value).toBe("Dây cáp điện CVV 3x2.5mm2");
    // Mặt hàng chưa có mã ở bộ XNK (chỉ có mã Kế toán/Kho) → mã hàng để trống, không lấy mã hiển thị của bộ khác.
    await pick("VAI-C15", "Vải canvas cotton");
    await waitFor(() => expect((within(dialog).getByLabelText(/^Tên hàng/) as HTMLInputElement).value).toBe("Vải canvas cotton khổ 1,5 m"), T);
    expect((within(dialog).getByLabelText("Mã hàng") as HTMLInputElement).value).toBe("");
  }, 90_000);

  it("hồ sơ đã truyền → chỉ xem, báo lý do, không có nút lưu", async () => {
    await saveManualShipment(DOS, { items: [{ description: "X", quantity: "1", unit: "PCE", unitPrice: "1" }] });
    getDb().dossiers.find((d) => d.id === DOS)!.status = "SUBMITTED";
    render();
    expect(await screen.findByText(/Hồ sơ đã duyệt hoặc đã truyền/, {}, T)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Xem" }));
    const dialog = await screen.findByRole("dialog", {}, T);
    expect(within(dialog).queryByRole("button", { name: "Lưu dữ liệu" })).toBeNull();
  }, 60_000);
});

describe("ManualShipmentCard – ký mã hiệu", () => {
  it("lưu ký mã hiệu in trên hóa đơn", async () => {
    await saveManualShipment(DOS, { buyer: { name: "Nordic Tooling Group AB" }, invoice: { incoterm: "FOB", currency: "USD" }, items: [{ description: "Drill bit 10mm", quantity: "10", unit: "PCE", unitPrice: "1" }] });
    render();
    await userEvent.click(await screen.findByRole("button", { name: "Sửa dữ liệu" }, T));
    const dialog = await screen.findByRole("dialog", {}, T);
    await userEvent.type(within(dialog).getByLabelText(/^Ký mã hiệu/), "NTG / SOLNA");
    await expectNoA11yViolations(dialog);
    await userEvent.click(within(dialog).getByRole("button", { name: "Lưu dữ liệu" }));
    await waitFor(() => expect(getDb().manualShipments[DOS]!.data).toMatchObject({ marks: "NTG / SOLNA" }), T);
  }, 90_000);
});
