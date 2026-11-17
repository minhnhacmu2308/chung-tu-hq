// @vitest-environment jsdom
// Khung Hải quan từ chối: lỗi dữ liệu → "Xem lỗi trên tờ khai"; FPT báo chưa mở cổng ký → hướng dẫn mở cổng ký, không bảo sửa tờ khai.
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SIGNING_PORT_CLOSED, type CustomsRejection } from "@kb/contracts";
import { expectNoA11yViolations, renderWithProviders } from "@/test/dom";
import { RejectionAlert } from "./submit-step";
import { SIGNING_PORT_MESSAGES } from "./signing-port-alert.messages";
import { SUBMIT_MESSAGES } from "./submit-step.messages";

const rej = (code: string): CustomsRejection => ({ operation: "IDA", at: "2026-11-17T01:00:00.000Z", errors: [{ code, message: "x" }] });

describe("RejectionAlert", () => {
  it("lỗi dữ liệu → tiêu đề từ chối + nút Xem lỗi gọi onViewErrors; không vi phạm a11y", async () => {
    const onViewErrors = vi.fn();
    const { container } = renderWithProviders(<RejectionAlert rejection={rej("E1028")} t={SUBMIT_MESSAGES.vi} onViewErrors={onViewErrors} />);
    expect(screen.getByText("Hải quan từ chối IDA – 1 lỗi")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: SUBMIT_MESSAGES.vi.viewErrors }));
    expect(onViewErrors).toHaveBeenCalledOnce();
    await expectNoA11yViolations(container);
  });
  it("chưa mở cổng ký → hướng dẫn mở cổng ký, không có nút Xem lỗi; không vi phạm a11y", async () => {
    const { container } = renderWithProviders(<RejectionAlert rejection={rej(SIGNING_PORT_CLOSED)} t={SUBMIT_MESSAGES.vi} onViewErrors={vi.fn()} />);
    expect(screen.getByText(SIGNING_PORT_MESSAGES.vi.title)).toBeTruthy();
    expect(screen.getByText(SIGNING_PORT_MESSAGES.vi.body)).toBeTruthy();
    expect(screen.queryByRole("button", { name: SUBMIT_MESSAGES.vi.viewErrors })).toBeNull();
    await expectNoA11yViolations(container);
  });
});
