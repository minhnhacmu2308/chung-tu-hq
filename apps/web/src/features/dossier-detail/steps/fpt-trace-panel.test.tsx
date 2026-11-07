// @vitest-environment jsdom
// GỠ LỖI TẠM (FPT_DEBUG_TRACE): khung "Nhật ký API FPT" – tắt thì ẩn, bật thì liệt kê từng lần gọi, mở ra thấy body gửi + phản hồi.
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { FptPreview, FptTraceView } from "@kb/contracts";
import { expectNoA11yViolations, renderWithProviders } from "@/test/dom";
import { FptPreviewButton, FptTracePanel } from "./fpt-trace-panel";

const api = vi.hoisted(() => ({ current: null as FptTraceView | null, preview: { enabled: false, sheets: [] } as FptPreview }));
vi.mock("@/api/customs", async (orig) => ({ ...(await orig<typeof import("@/api/customs")>()), getFptTrace: async () => api.current!, getFptPreview: async () => api.preview }));

const AT = new Date().toISOString();
const VIEW: FptTraceView = {
  enabled: true,
  entries: [
    { id: "t2", at: AT, operation: "VNACCSREP", path: "/api/VNACCSREP", dossierId: null, status: null, durationMs: 60000, request: { useR_ID: "BI820001", password: "***" }, response: null, error: "FPT không phản hồi" },
    { id: "t1", at: AT, operation: "IDA", path: "/api/IDA", dossierId: "dos_1", status: 200, durationMs: 412, request: { objVN_IDA: { tK_CH: "88AB" } }, response: { errorList: [] }, error: null },
  ],
};

describe("FptTracePanel", () => {
  it("backend tắt cờ → không hiện gì", async () => {
    api.current = { enabled: false, entries: [] };
    const { container } = renderWithProviders(<FptTracePanel dossierId="dos_1" refreshAt={1} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(container.textContent).toBe("");
  });

  it("bật → mỗi lần gọi một dòng; mở ra thấy body gửi + phản hồi; không vi phạm a11y", async () => {
    api.current = VIEW;
    const { container } = renderWithProviders(<FptTracePanel dossierId="dos_1" refreshAt={1} />);
    expect(await screen.findByText("Nhật ký API FPT")).toBeTruthy();
    expect(screen.getByText("HTTP 200")).toBeTruthy();
    expect(screen.getByText("Không kết nối")).toBeTruthy();
    expect(screen.getByText("Chung doanh nghiệp")).toBeTruthy();
    await userEvent.click(screen.getByText("/api/IDA"));
    expect(container.textContent).toContain('"tK_CH": "88AB"');
    expect(container.textContent).toContain('"errorList": []');
    expect(screen.getByRole("button", { name: "Sao chép body gửi đi của IDA" })).toBeTruthy();
    await userEvent.click(screen.getByText("/api/VNACCSREP"));
    expect(screen.getByText("Lỗi: FPT không phản hồi")).toBeTruthy();
    expect(screen.getByText("Không nhận được phản hồi")).toBeTruthy();
    expect(screen.getByText(/^60[.,\s ]?000 ms$/)).toBeTruthy();
    await expectNoA11yViolations(container);
  });
});

describe("FptPreviewButton", () => {
  it("backend tắt cờ → không có nút", async () => {
    api.preview = { enabled: false, sheets: [] };
    const { container } = renderWithProviders(<FptPreviewButton dossierId="dos_1" />);
    await new Promise((r) => setTimeout(r, 20));
    expect(container.textContent).toBe("");
  });

  it("bật → mở hộp thấy body từng tờ + lỗi chặn / cảnh báo; không vi phạm a11y", async () => {
    api.preview = {
      enabled: true,
      sheets: [
        { branch: 1, of: 2, operation: "IDA", path: "/api/IDA", request: { objVN_IDA: { tK_CH: "88AB" } }, missing: null, blockers: [], issues: [], warnings: ["TK_IMY: chưa có mã bưu chính"] },
        { branch: 2, of: 2, operation: "IDA", path: "/api/IDA", request: { objVN_IDA: { tK_FIC: "000000000000" } }, missing: "1.13 Tên người nhập khẩu", blockers: ["Thiếu mã HS dòng 51"], issues: [], warnings: [] },
      ],
    };
    renderWithProviders(<FptPreviewButton dossierId="dos_1" />);
    await userEvent.click(await screen.findByRole("button", { name: "Xem trước payload" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toContain('"tK_CH": "88AB"');
    expect(screen.getByText("Tờ 1/2")).toBeTruthy();
    expect(screen.getByText("Còn thiếu ô bắt buộc")).toBeTruthy();
    expect(screen.getByText("Thiếu mã HS dòng 51")).toBeTruthy();
    expect(screen.getByText("TK_IMY: chưa có mã bưu chính")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Sao chép body gửi đi của IDA" })).toHaveLength(2);
    await expectNoA11yViolations(dialog);
  });
});
