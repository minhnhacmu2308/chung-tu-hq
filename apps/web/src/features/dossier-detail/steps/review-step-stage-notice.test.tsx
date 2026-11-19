// @vitest-environment jsdom
// Bước Review: thông báo giai đoạn sửa đặt trên bản in (chuyển từ form Phụ lục II cũ) – chưa khai: số chỉ tiêu sửa được; đã duyệt: chỉ đọc.
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, resetDb } from "@/mocks/db";
import { renderWithProviders } from "@/test/dom";
import { ReviewStep } from "./review-step";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/dossiers/dos_028",
  useSearchParams: () => new URLSearchParams("step=review"),
}));

// Bản in 120 dòng vẽ chậm khi cả bộ test chạy song song → chờ rộng tay.
const T = { timeout: 150_000 };
const dossier = () => getDb().dossiers.find((d) => d.id === "dos_028")!;
const setStatus = (status: "DRAFT" | "APPROVED") => {
  getDb().declarations.find((x) => x.dossierId === "dos_028")!.status = status;
};

beforeEach(() => {
  resetDb();
});

describe("ReviewStep – thông báo giai đoạn sửa trên bản in", () => {
  it("bản nháp (chưa khai) → không có khung thông báo; nút ? cạnh tiêu đề mở hướng dẫn kèm số chỉ tiêu sửa được", async () => {
    setStatus("DRAFT");
    renderWithProviders(<ReviewStep dossier={dossier()} goTo={vi.fn()} />);
    const help = await screen.findByLabelText("Hướng dẫn sửa tờ khai", { selector: "button" }, T);
    expect(screen.queryByText("Tờ khai chưa khai báo – nhập đủ chỉ tiêu")).toBeNull();
    expect(screen.queryByText("Tờ khai chỉ đọc")).toBeNull();
    await userEvent.click(help);
    const text = document.querySelector("[role=dialog][aria-label=\"Hướng dẫn sửa tờ khai\"]")?.textContent ?? "";
    expect(text).toContain("Tờ khai chưa khai báo – nhập đủ chỉ tiêu");
    expect(text).toMatch(/Sửa được \d[\d.]* chỉ tiêu người khai nhập/);
  }, 240_000);

  it("đã phê duyệt → chỉ đọc, chỉ cách mở lại / gọi về", async () => {
    setStatus("APPROVED");
    renderWithProviders(<ReviewStep dossier={dossier()} goTo={vi.fn()} />);
    expect(await screen.findByText("Tờ khai chỉ đọc", {}, T)).toBeTruthy();
    expect(screen.getByText(/^Tờ khai đã phê duyệt \/ đã truyền\. Mở lại tờ khai/)).toBeTruthy();
    expect(screen.queryByLabelText("Hướng dẫn sửa tờ khai", { selector: "button" })).toBeNull();
  }, 240_000);

  it("tiếng Anh", async () => {
    setStatus("DRAFT");
    renderWithProviders(<ReviewStep dossier={dossier()} goTo={vi.fn()} />, "en");
    await userEvent.click(await screen.findByLabelText("How to edit the declaration", { selector: "button" }, T));
    expect(document.querySelector("[role=dialog]")?.textContent).toContain("Declaration not filed yet – fill in all fields");
  }, 240_000);
});
