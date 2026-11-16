// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { usePageTitle } from "./use-page-title";

vi.mock("next/navigation", () => ({ usePathname: () => "/dossiers" }));

describe("usePageTitle – tên thương hiệu", () => {
  it("thay KhaiBáo AI bằng tên doanh nghiệp, kể cả khi Next đặt lại <title> sau khi chuyển trang", async () => {
    const { unmount } = renderHook(() => usePageTitle("An Phát Logistics"));
    expect(document.title).toContain("An Phát Logistics");
    expect(document.title).not.toContain("KhaiBáo AI");
    document.title = "Hồ sơ khai báo · KhaiBáo AI"; // như metadata của Next ghi đè
    await new Promise((r) => setTimeout(r, 0)); // MutationObserver chạy ở microtask
    expect(document.title).not.toContain("KhaiBáo AI");
    expect(document.title).toContain("An Phát Logistics");
    unmount();
  });
});
