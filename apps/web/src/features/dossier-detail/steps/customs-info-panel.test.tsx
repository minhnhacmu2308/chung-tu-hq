// @vitest-environment jsdom
// Khối "Hải quan trả về": ngày hoàn thành kiểm tra (IDA TK_C22 – không có trên mẫu in IDA) hiện cạnh cấp phép, chỉ khi Hải quan đã trả.
import type { CustomsInfo } from "@kb/contracts";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoA11yViolations, renderWithProviders } from "@/test/dom";
import { CustomsInfoPanel } from "./customs-info-panel";

const base: CustomsInfo = { receivedAt: "2026-11-10T03:00:00Z", declarationNo: "107000000001", exchangeRates: [], taxes: [], items: [], directives: [] };

describe("CustomsInfoPanel – hoàn thành kiểm tra", () => {
  it("có ngày hoàn thành kiểm tra → hiện khung riêng; chưa có → không hiện", async () => {
    const { container, unmount } = renderWithProviders(<CustomsInfoPanel kind="IDA" info={{ ...base, inspectionDoneDate: "2026-11-12", permitDate: "2026-11-13" }} />);
    expect(screen.getByText("Hải quan đã hoàn thành kiểm tra")).toBeTruthy();
    expect(screen.getByText("Hải quan đã cấp phép thông quan")).toBeTruthy();
    await expectNoA11yViolations(container);
    unmount();
    renderWithProviders(<CustomsInfoPanel kind="IDA" info={base} />);
    expect(screen.queryByText("Hải quan đã hoàn thành kiểm tra")).toBeNull();
  });
  it("tiếng Anh / tiếng Trung", () => {
    const { unmount } = renderWithProviders(<CustomsInfoPanel kind="IDA" info={{ ...base, inspectionDoneDate: "2026-11-12" }} />, "en");
    expect(screen.getByText("Customs has completed the inspection")).toBeTruthy();
    unmount();
    renderWithProviders(<CustomsInfoPanel kind="EDA" info={{ ...base, inspectionDoneDate: "2026-11-12" }} />, "zh");
    expect(screen.getByText("海关已完成查验")).toBeTruthy();
  });
});

describe("CustomsInfoPanel – tờ đã hủy", () => {
  it("không có ngày đăng ký / phân loại → '—', không còn 'Có sau khi khai chính thức'; có giá trị → hiện giá trị", () => {
    const { unmount } = renderWithProviders(<CustomsInfoPanel kind="IDA" cancelled info={base} />);
    expect(screen.queryByText("Có sau khi khai chính thức")).toBeNull();
    unmount();
    renderWithProviders(<CustomsInfoPanel kind="IDA" cancelled info={{ ...base, registeredDate: "2026-11-10", registeredTime: "09:30:00" }} />);
    expect(screen.getByText(/10\/11\/2026 09:30:00/)).toBeTruthy();
    expect(screen.queryByText("Có sau khi khai chính thức")).toBeNull();
  });
});
