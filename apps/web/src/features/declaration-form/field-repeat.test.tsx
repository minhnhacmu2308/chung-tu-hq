// @vitest-environment jsdom
// Khối "Thuế và thu khác": 5 dòng cố định, nhãn là loại thuế (không có số ô), không có "Thêm dòng", lỗi / cảnh báo hiện dưới đúng dòng; chỉ xem hiện dòng có giá trị.
import { LAYOUT_IDA, conditionContext, type LayoutRepeat } from "@kb/contracts";
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations, renderWithProviders } from "@/test/dom";
import { FieldChecksProvider } from "./field-checks";
import { FormFieldRepeat } from "./field-repeat";

const repeat = LAYOUT_IDA.item.declarant.flatMap((b) => b.items).find((it): it is LayoutRepeat => it.kind === "repeat" && it.fixedRows === true)!;
const GROUPS = ["CBPG (tự vệ, chống trợ cấp, chống bán phá giá)", "Chống phân biệt đối xử", "Tiêu thụ đặc biệt", "Bảo vệ môi trường", "GTGT"];

/** Khối ghi chú của dòng (nằm ngoài bảng): lần theo aria-describedby của ô trong dòng. */
const noteOf = (group: string): HTMLElement => {
  const input = screen.getAllByLabelText(new RegExp(`Mã áp dụng thuế suất – ${group}`))[0]!;
  return document.getElementById(input.getAttribute("aria-describedby")!)!;
};

const view = (values: Record<string, string>, opts: { edit?: boolean; checks?: { key: string; reason: string; onConfirm?: () => void }[] } = {}) => (
  <FieldChecksProvider value={opts.checks ?? []}>
    <FormFieldRepeat kind="IDA" repeat={repeat} values={values} onChange={opts.edit === false ? undefined : () => {}} ctx={conditionContext("IDA", values)} showInapplicable={false} />
  </FieldChecksProvider>
);

describe("FormFieldRepeat – thuế và thu khác (dòng cố định theo loại)", () => {
  it("sửa: 5 nhãn loại thuế, không nút thêm dòng, không chữ 'tối đa'; a11y sạch", async () => {
    const { container } = renderWithProviders(view({}));
    for (const g of GROUPS) expect(screen.getByRole("rowheader", { name: g })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /thêm dòng/i })).toBeNull();
    expect(screen.queryByText(/tối đa/i)).toBeNull();
    expect(screen.getByLabelText(/Mã áp dụng thuế suất – GTGT/)).toBeTruthy();
    await expectNoA11yViolations(container);
  });

  it("còn thiếu GTGT: báo ở dòng GTGT; có mã GTGT → hết báo", () => {
    const { unmount } = renderWithProviders(view({}));
    const gtgt = noteOf("GTGT");
    expect(within(gtgt).getByText("Còn thiếu")).toBeTruthy();
    unmount();
    renderWithProviders(view({ HAG_TX5: "VB901" }));
    expect(screen.queryByText("Còn thiếu")).toBeNull();
  });

  it("ô GTGT tự điền có cảnh báo dưới dòng GTGT (theo mã lý do); lỗi chặn dưới dòng sai", async () => {
    const { container } = renderWithProviders(view({ HAG_TX5: "VB901", HAG_TX1: "BB01", HAG_TX3: "CB01" }, { checks: [{ key: "HAG_TX5", reason: "VAT_FROM_RATE" }] }));
    const gtgtNote = noteOf("GTGT");
    expect(gtgtNote.textContent).toContain("GTGT: ");
    expect(within(gtgtNote).getByText("Mã GTGT tự điền theo thuế suất của dòng hàng – kiểm tra lại")).toBeTruthy();
    // ghi chú nằm ngoài khung cuộn ngang của bảng
    expect(gtgtNote.closest("table")).toBeNull();
    const ttdbNote = noteOf("Tiêu thụ đặc biệt");
    expect(within(ttdbNote).getByText(/hơn một mã thuế cùng loại/)).toBeTruthy();
    // ô của dòng có ghi chú trỏ tới ghi chú qua aria-describedby
    expect(screen.getAllByLabelText(/Mã áp dụng thuế suất – Tiêu thụ đặc biệt/)[0]!.getAttribute("aria-describedby")).toBe(ttdbNote.id);
    await expectNoA11yViolations(container);
  }, 15000);

  it("chỉ xem: chỉ dòng có giá trị, nhãn theo loại thuế", () => {
    renderWithProviders(view({ HAG_TX3: "TB020", HAG_TX5: "VB901" }, { edit: false }));
    expect(screen.getByRole("rowheader", { name: "Tiêu thụ đặc biệt" })).toBeTruthy();
    expect(screen.getByRole("rowheader", { name: "GTGT" })).toBeTruthy();
    expect(screen.queryByRole("rowheader", { name: "Bảo vệ môi trường" })).toBeNull();
  });

  it("đổi qua lại chỉ xem ↔ sửa, trống → có dòng: không lỗi hook (useId gọi trước return sớm)", () => {
    const { rerender } = renderWithProviders(view({}, { edit: false }));
    expect(screen.queryByRole("rowheader", { name: "GTGT" })).toBeNull();
    expect(() => rerender(view({}))).not.toThrow();
    expect(screen.getByRole("rowheader", { name: "GTGT" })).toBeTruthy();
    expect(() => rerender(view({}, { edit: false }))).not.toThrow();
    expect(() => rerender(view({ HAG_TX5: "VB901" }, { edit: false }))).not.toThrow();
    expect(screen.getByRole("rowheader", { name: "GTGT" })).toBeTruthy();
  });

  it("còn thiếu GTGT xét theo giá trị đã chuẩn hóa: mã GTGT nằm ở ô 1 (dữ liệu cũ) → không báo thiếu", () => {
    renderWithProviders(view({ HAG_TX1: "VB901" }));
    expect(screen.queryByText("Còn thiếu")).toBeNull();
  });

  it("cảnh báo GTGT có onConfirm + ô có mã → nút Xác nhận (gọi onConfirm); ô trống / chỉ xem / không onConfirm → không có nút; a11y sạch", async () => {
    const onConfirm = vi.fn();
    const { container, unmount } = renderWithProviders(view({ HAG_TX5: "VB901" }, { checks: [{ key: "HAG_TX5", reason: "VAT_FROM_RATE", onConfirm }] }));
    const gtgtNote = noteOf("GTGT");
    fireEvent.click(within(gtgtNote).getByRole("button", { name: "Xác nhận mã GTGT VB901 là đúng" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
    unmount();
    const r2 = renderWithProviders(view({ HAG_TX5: "" }, { checks: [{ key: "HAG_TX5", reason: "VAT_FROM_RATE", onConfirm }] }));
    expect(screen.queryByRole("button", { name: /Xác nhận mã GTGT/ })).toBeNull();
    r2.unmount();
    const r3 = renderWithProviders(view({ HAG_TX5: "VB901" }, { edit: false, checks: [{ key: "HAG_TX5", reason: "VAT_FROM_RATE", onConfirm }] }));
    expect(screen.queryByRole("button", { name: /Xác nhận mã GTGT/ })).toBeNull();
    r3.unmount();
    renderWithProviders(view({ HAG_TX5: "VB901" }, { checks: [{ key: "HAG_TX5", reason: "VAT_FROM_RATE" }] }));
    expect(screen.queryByRole("button", { name: /Xác nhận mã GTGT/ })).toBeNull();
  }, 15000);
});
