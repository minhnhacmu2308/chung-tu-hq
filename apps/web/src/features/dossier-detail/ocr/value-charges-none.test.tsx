// @vitest-environment jsdom
// "Không có phí phát sinh": cước bắt buộc theo điều kiện giao hàng → lựa chọn khóa kèm lý do + nút đổi điều kiện giao hàng;
// khoản điều chỉnh: chứng từ không có phí khác → chọn được, chứng từ có phí khác → khóa.
import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_VALUE_CHARGES, type ValueChargesView } from "@kb/contracts";
import { resetDb } from "@/mocks/db";
import { renderWithProviders } from "@/test/dom";
import { ValueChargesCard } from "./value-charges-card";

const api = vi.hoisted(() => ({ view: null as ValueChargesView | null }));
vi.mock("@/api/value-charges", async (orig) => ({ ...(await orig<typeof import("@/api/value-charges")>()), getValueCharges: async () => api.view! }));

const T = { timeout: 20_000 };
const VIEW: ValueChargesView = {
  charges: EMPTY_VALUE_CHARGES, direction: "NK", incoterm: "FCA", freightRequired: true, insuranceIncluded: false, locked: false, updatedAt: null, updatedBy: null,
  fromDocuments: { freight: null, insurance: null, other: [] },
};

beforeEach(() => resetDb());

describe("Chi phí – Không có phí phát sinh", () => {
  it("FCA, chứng từ chưa có cước: lựa chọn khóa, nêu lý do; nút đổi điều kiện giao hàng gọi onEditIncoterm", async () => {
    api.view = VIEW;
    const onEditIncoterm = vi.fn();
    renderWithProviders(<ValueChargesCard dossierId="dos_023" currency="USD" onEditIncoterm={onEditIncoterm} />);
    fireEvent.click(await screen.findByText("Sửa chi phí", {}, T));
    expect(await screen.findByText(/Không chọn được: điều kiện FCA bắt buộc khai phí vận chuyển/, {}, T)).toBeTruthy();
    const radios = screen.getAllByRole("radio", { name: /Không có phí phát sinh/ });
    expect((radios[0] as HTMLInputElement).disabled).toBe(true); // cước
    expect((radios[1] as HTMLInputElement).disabled).toBe(false); // khoản điều chỉnh: chứng từ không có phí khác
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Đổi điều kiện giao hàng" }));
    vi.runAllTimers();
    vi.useRealTimers();
    expect(onEditIncoterm).toHaveBeenCalledOnce();
  }, 60_000);

  it("chứng từ có phí khác → khoản điều chỉnh không chọn được Không có phí phát sinh", async () => {
    api.view = { ...VIEW, fromDocuments: { freight: null, insurance: null, other: [{ label: "Commission", amount: "50", currency: "USD", kind: "INVOICE" }] } };
    renderWithProviders(<ValueChargesCard dossierId="dos_023" currency="USD" />);
    fireEvent.click(await screen.findByText("Sửa chi phí", {}, T));
    expect(await screen.findByText("Không chọn được: chứng từ có 1 khoản phí khác – lập danh sách khoản điều chỉnh.", {}, T)).toBeTruthy();
    const radios = screen.getAllByRole("radio", { name: /Không có phí phát sinh/ });
    expect(radios.every((r) => (r as HTMLInputElement).disabled)).toBe(true);
    expect(screen.queryByRole("button", { name: "Đổi điều kiện giao hàng" })).toBeNull(); // không truyền onEditIncoterm
  }, 60_000);
});
