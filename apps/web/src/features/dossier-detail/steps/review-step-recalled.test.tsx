// @vitest-environment jsdom
// Bước Review: thông báo "đã gọi về" từ ?recalled= – chỉ hiện khi tờ khai đang ở bản nháp.
import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, resetDb } from "@/mocks/db";
import { renderWithProviders } from "@/test/dom";
import { ReviewStep } from "./review-step";

const nav = vi.hoisted(() => ({ query: "" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/dossiers/dos_028",
  useSearchParams: () => new URLSearchParams(nav.query),
}));

// Bản in 120 dòng vẽ chậm khi cả bộ test chạy song song → chờ rộng tay (chạy riêng ~10 s).
const T = { timeout: 45_000 };
const dossier = () => getDb().dossiers.find((d) => d.id === "dos_028")!;
const setStatus = (status: "DRAFT" | "APPROVED") => {
  const d = getDb().declarations.find((x) => x.dossierId === "dos_028")!;
  d.status = status;
};

beforeEach(() => {
  resetDb();
});

describe("ReviewStep – thông báo đã gọi về", () => {
  it("recalled=all:3 + bản nháp → 'Đã gọi về 3 tờ…'", async () => {
    setStatus("DRAFT");
    nav.query = "step=review&recalled=all:3";
    renderWithProviders(<ReviewStep dossier={dossier()} goTo={vi.fn()} />);
    expect(await screen.findByText("Đã gọi về 3 tờ – sửa tờ khai rồi duyệt lại", {}, T)).toBeTruthy();
  }, 90_000);

  // recalled=2 khi còn tờ chưa gọi về (phạm vi một phần) → thông báo hiện: review-step-scope.test.tsx.
  it("recalled=2 + bản nháp nhưng không còn tờ khóa (lô chưa truyền) → không hiện thông báo phạm vi một phần (cũ)", async () => {
    setStatus("DRAFT");
    nav.query = "step=review&recalled=2";
    renderWithProviders(<ReviewStep dossier={dossier()} goTo={vi.fn()} />);
    await screen.findAllByText("Bản nháp, chờ duyệt", {}, T);
    expect(screen.queryByText(/Đã gọi về tờ 2/)).toBeNull();
  }, 90_000);

  it("tiếng Anh", async () => {
    setStatus("DRAFT");
    nav.query = "step=review&recalled=all:3";
    renderWithProviders(<ReviewStep dossier={dossier()} goTo={vi.fn()} />, "en");
    expect(await screen.findByText("3 sheets recalled – edit the declaration, then approve it again", {}, T)).toBeTruthy();
  }, 90_000);

  it("đã duyệt lại (không còn bản nháp) → không hiện thông báo", async () => {
    setStatus("APPROVED");
    nav.query = "step=review&recalled=all:3";
    renderWithProviders(<ReviewStep dossier={dossier()} goTo={vi.fn()} />);
    await screen.findAllByText("Đã phê duyệt", {}, T);
    expect(screen.queryByText(/Đã gọi về 3 tờ/)).toBeNull();
  }, 90_000);
});
