// @vitest-environment jsdom
// Trang in tờ khai (chỉ đọc): tờ đã có số → tiêu đề kèm số, về bước Khai báo Hải quan, không chữ chìm nháp;
// tờ chưa khai → chữ chìm "BẢN NHÁP", về Review; hồ sơ chưa có tờ khai → EmptyState; không có công tắc sửa nhanh; a11y.
import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, resetDb } from "@/mocks/db";
import { expectNoA11yViolations, renderWithProviders } from "@/test/dom";
import { DeclarationPrintPage, declarationPrintHref } from "./declaration-print-page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/dossiers/x/declaration/print",
  useSearchParams: () => new URLSearchParams(),
}));

const T = { timeout: 10_000 };
const DRAFT_MARK = "BẢN NHÁP – CHƯA KHAI HẢI QUAN";

beforeEach(() => resetDb());

describe("declarationPrintHref", () => {
  it("tờ 1 không kèm ?to; tờ k > 1 kèm ?to=k", () => {
    expect(declarationPrintHref("dos_1")).toBe("/dossiers/dos_1/declaration/print");
    expect(declarationPrintHref("dos_1", 1)).toBe("/dossiers/dos_1/declaration/print");
    expect(declarationPrintHref("dos_1", 3)).toBe("/dossiers/dos_1/declaration/print?to=3");
  });
});

describe("Trang in tờ khai", () => {
  it("tờ đã có số: tiêu đề kèm số, về bước Khai báo Hải quan, không chữ chìm nháp, không sửa nhanh; a11y", async () => {
    const { container } = renderWithProviders(<DeclarationPrintPage dossierId="dos_019" sheet={1} />);
    expect(await screen.findByRole("heading", { name: /^In tờ khai \d+/ }, T)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Về bước Khai báo Hải quan/ }).getAttribute("href")).toBe("/dossiers/dos_019?step=submit");
    expect(screen.queryByText(DRAFT_MARK)).toBeNull();
    expect(screen.queryByRole("switch", { name: /Sửa nhanh/ })).toBeNull();
    expect(screen.getByRole("button", { name: /In/ })).toBeTruthy();
    await expectNoA11yViolations(container);
  }, 30_000);

  it("tờ chưa khai: chữ chìm BẢN NHÁP, về Review tờ khai", async () => {
    const db = getDb();
    const id = db.dossiers.find((d) => d.step === "review" && !db.customsFlows[d.id] && !d.declarationNo)!.id;
    renderWithProviders(<DeclarationPrintPage dossierId={id} sheet={1} />);
    expect((await screen.findAllByText(DRAFT_MARK, {}, T)).length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "In tờ khai" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Về Review tờ khai/ }).getAttribute("href")).toBe(`/dossiers/${id}?step=review`);
  }, 30_000);

  it("hồ sơ chưa có tờ khai → EmptyState kèm nút về hồ sơ", async () => {
    const db = getDb();
    const id = db.dossiers.find((d) => d.step === "upload")!.id;
    renderWithProviders(<DeclarationPrintPage dossierId={id} sheet={1} />);
    expect(await screen.findByText("Chưa có tờ khai để in", {}, T)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Về hồ sơ/ }).getAttribute("href")).toBe(`/dossiers/${id}`);
  }, 30_000);
});
