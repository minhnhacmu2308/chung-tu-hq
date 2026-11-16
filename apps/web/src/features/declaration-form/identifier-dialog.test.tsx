// @vitest-environment jsdom
// Panel "Khai báo định danh" trên hồ sơ thật (mock dos_029): điền sẵn từ tờ khai → Gửi khai báo → mới có số tiếp nhận → Hỏi kết quả → số định danh + ảnh QR;
// thiếu ô bắt buộc → báo còn thiếu, không gửi; mở lại panel điền lại từ lần gửi trước; a11y.
import { IDENTIFIER_FORM } from "@kb/contracts";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetDb } from "@/mocks/db";
import { expectNoA11yViolations, renderWithProviders } from "@/test/dom";
import { identifierRequestOf, requestValues, resultValues } from "./identifier-dialog";
import { TransportOperationsBar } from "./transport-operations-bar";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/dossiers/dos_029",
  useSearchParams: () => new URLSearchParams(),
}));

const T = { timeout: 8000 };
const HEADER = { TK_IMC: "0316789012", TK_IMN: "CÔNG TY TNHH THIẾT BỊ CÔNG NGHIỆP AN PHÁT", TK_CH: "03CE" };
const open = async () => {
  await userEvent.click(screen.getByRole("button", { name: "Khai báo định danh" }));
  return screen.findByRole("dialog", { name: "Khai báo định danh hàng hóa" }, T);
};

beforeEach(() => resetDb());

describe("identifierRequestOf / requestValues / resultValues", () => {
  it("ô panel (tên chỉ tiêu FPT) → yêu cầu; ô tùy chọn trống bị bỏ; khứ hồi về ô", () => {
    const values = { LOAI_DT: "1", LOAI_HH: "2", MA_HQ: "60CB", MA_DV: "0313833810", TEN_DV: "test", MA_DAI_LY: "", TEN_DAI_LY: " ", USER_ID: "" };
    const r = identifierRequestOf(values);
    expect(r.success && r.data).toEqual({ objectType: "1", goodsType: "2", customsOffice: "60CB", taxCode: "0313833810", companyName: "test" });
    expect(requestValues(r.success ? r.data : (null as never))).toMatchObject({ LOAI_DT: "1", LOAI_HH: "2", MA_HQ: "60CB", MA_DV: "0313833810", TEN_DV: "test", MA_DAI_LY: "" });
  });
  it("thiếu MST → lỗi tại taxCode", () => {
    const r = identifierRequestOf({ LOAI_DT: "1", LOAI_HH: "1", MA_HQ: "03CE", TEN_DV: "A" });
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.path[0])).toEqual(["taxCode"]);
  });
  it("kết quả → ô chỉ đọc (năm tiếp nhận lấy từ ngày); chưa có → rỗng", () => {
    expect(resultValues(null)).toEqual({});
    expect(resultValues({ attempt: 1, status: "ACCEPTED", request: { objectType: "1", goodsType: "1", customsOffice: "X", taxCode: "1", companyName: "A" }, refId: "R", receiptNo: "100", receiptDate: "2026-11-15", customsState: "15", identifierNo: "1226", identifiedOn: "2026-11-15", qrPng: "iVBOR", resultText: "OK", errors: [], sentAt: "2026-11-15T03:00:00.000Z" }))
      .toEqual({ REF_ID: "R", SO_TN: "100", NGAY_TN: "2026-11-15", NAM_TN: "2026", SO_DD: "1226", NGAY_DD: "2026-11-15", TRANG_THAI: "15", KET_QUA: "OK" });
  });
  it("khóa ô khớp IDENTIFIER_FORM (đổi tên chỉ tiêu ở contracts thì test báo)", () => {
    const keys = IDENTIFIER_FORM.blocks.flatMap((b) => b.items.flatMap((i) => ("fields" in i ? i.fields.map((f) => f.key) : "key" in i ? [i.key] : [])));
    expect(keys).toEqual(expect.arrayContaining(Object.keys(requestValues({ objectType: "1", goodsType: "1", customsOffice: "X", taxCode: "1", companyName: "A" }))));
  });
});

describe("Panel Khai báo định danh – hồ sơ thật (mock dos_029)", () => {
  it("điền sẵn từ tờ khai → Gửi → mới có số tiếp nhận → Hỏi kết quả → khung kết quả (số định danh + QR) → Xác nhận điền số vào ô vận đơn; a11y", async () => {
    const onIdentifier = vi.fn();
    const { container } = renderWithProviders(<TransportOperationsBar kind="IDA" header={HEADER} amending={false} showInapplicable dossierId="dos_029" onIdentifier={onIdentifier} />);
    const dialog = await open();
    await within(dialog).findByText("Chưa gửi khai báo định danh", undefined, T);
    expect((within(dialog).getByRole("textbox", { name: /Mã số thuế$/ }) as HTMLInputElement).value).toBe("0316789012");
    await userEvent.click(within(dialog).getByRole("button", { name: "Gửi khai báo" }));
    // Mới cấp số tiếp nhận, chưa có số định danh → báo rõ, Hỏi kết quả bấm được ngay, Gửi khai báo khóa.
    await within(dialog).findByText(/^Hải quan đã cấp số tiếp nhận 1192\d{8} – chưa có số định danh$/, undefined, T);
    expect(within(dialog).getByText("Bấm Hỏi kết quả để lấy số định danh và mã QR.")).toBeTruthy();
    expect((within(dialog).getByRole("button", { name: "Gửi khai báo" }) as HTMLButtonElement).disabled).toBe(true);
    const ask = within(dialog).getByRole("button", { name: "Hỏi kết quả" });
    expect((ask as HTMLButtonElement).disabled).toBe(false);
    await userEvent.click(ask);
    const qr = await within(dialog).findByRole("img", { name: /^Mã QR định danh 1226\d{11}$/ }, T);
    // Số định danh, trạng thái và mã QR cùng nằm trong khung kết quả.
    const result = within(dialog).getByRole("region", { name: "Kết quả định danh" });
    const no = /1226\d{11}/.exec(result.textContent ?? "")![0];
    expect(within(result).getByText(no)).toBeTruthy();
    expect(within(result).getByText("Hải quan chấp nhận")).toBeTruthy();
    expect(within(result).getByRole("img", { name: /^Mã QR định danh/ })).toBe(qr);
    // Đã cấp số: không gửi lại / hỏi lại, thay bằng Xác nhận.
    expect(within(dialog).queryByRole("button", { name: "Gửi khai báo" })).toBeNull();
    expect(within(dialog).queryByRole("button", { name: "Hỏi kết quả" })).toBeNull();
    await expectNoA11yViolations(container);
    await userEvent.click(within(dialog).getByRole("button", { name: "Xác nhận" }));
    expect(onIdentifier).toHaveBeenCalledWith(no);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Khai báo định danh hàng hóa" })).toBeNull());
  }, 30_000);

  it("xóa MST → báo còn thiếu, không gửi", async () => {
    renderWithProviders(<TransportOperationsBar kind="IDA" header={HEADER} amending={false} showInapplicable dossierId="dos_029" />);
    const dialog = await open();
    await within(dialog).findByText("Chưa gửi khai báo định danh", undefined, T);
    await userEvent.clear(within(dialog).getByRole("textbox", { name: /Mã số thuế$/ }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Gửi khai báo" }));
    expect(await within(dialog).findByText("Chưa đủ thông tin để gửi")).toBeTruthy();
    expect(within(dialog).getByText("Còn thiếu: Mã số thuế")).toBeTruthy();
    expect(within(dialog).queryByText(/Hải quan đã cấp số tiếp nhận/)).toBeNull();
  }, 30_000);
});
