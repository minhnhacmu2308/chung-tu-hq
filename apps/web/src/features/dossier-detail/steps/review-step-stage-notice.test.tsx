// @vitest-environment jsdom
// Bước Review: thông báo giai đoạn sửa đặt trên bản in (chuyển từ form Phụ lục II cũ) – chưa khai: số chỉ tiêu sửa được; đã duyệt: chỉ đọc.
import { screen } from "@testing-library/react";
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
const T = { timeout: 45_000 };
const dossier = () => getDb().dossiers.find((d) => d.id === "dos_028")!;
const setStatus = (status: "DRAFT" | "APPROVED") => {
  getDb().declarations.find((x) => x.dossierId === "dos_028")!.status = status;
};

beforeEach(() => {
  resetDb();
});

describe("ReviewStep – thông báo giai đoạn sửa trên bản in", () => {
  it("bản nháp (chưa khai) → 'Tờ khai chưa khai báo' kèm số chỉ tiêu sửa được", async () => {
    setStatus("DRAFT");
    renderWithProviders(<ReviewStep dossier={dossier()} goTo={vi.fn()} />);
    expect(await screen.findByText("Tờ khai chưa khai báo – nhập đủ chỉ tiêu", {}, T)).toBeTruthy();
    expect(screen.getByText(/^Sửa được \d[\d.]* chỉ tiêu người khai nhập/)).toBeTruthy();
    expect(screen.queryByText("Tờ khai chỉ đọc")).toBeNull();
  }, 90_000);

  it("đã phê duyệt → chỉ đọc, chỉ cách mở lại / gọi về", async () => {
    setStatus("APPROVED");
    renderWithProviders(<ReviewStep dossier={dossier()} goTo={vi.fn()} />);
    expect(await screen.findByText("Tờ khai chỉ đọc", {}, T)).toBeTruthy();
    expect(screen.getByText(/^Tờ khai đã phê duyệt \/ đã truyền\. Mở lại tờ khai/)).toBeTruthy();
    expect(screen.queryByText("Tờ khai chưa khai báo – nhập đủ chỉ tiêu")).toBeNull();
  }, 90_000);

  it("tiếng Anh", async () => {
    setStatus("DRAFT");
    renderWithProviders(<ReviewStep dossier={dossier()} goTo={vi.fn()} />, "en");
    expect(await screen.findByText("Declaration not filed yet – fill in all fields", {}, T)).toBeTruthy();
  }, 90_000);
});
