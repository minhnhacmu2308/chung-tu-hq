// @vitest-environment jsdom
// Bước Truyền Hải quan khi tờ khai đã thông quan (dos_029 NK container, mock thật): CONT_LIST / KVGS không còn nút "Gửi" ở dòng nghiệp vụ
// hay ở "Việc tiếp theo" (performOperation luôn từ chối hai nghiệp vụ này) – thay bằng thẻ "Qua khu vực giám sát" (#kvgs-1) và lối tắt tới thẻ.
import { screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, resetDb } from "@/mocks/db";
import { renderWithProviders } from "@/test/dom";
import { SubmitStep } from "./submit-step";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/dossiers/dos_029",
  useSearchParams: () => new URLSearchParams(),
}));

const T = { timeout: 8000 };

beforeEach(() => resetDb());

describe("SubmitStep – Qua khu vực giám sát", () => {
  it("CLEARED: không có nút Gửi cho CONT_LIST / KVGS; có thẻ Qua khu vực giám sát và lối tắt #kvgs-1", async () => {
    const dossier = getDb().dossiers.find((d) => d.id === "dos_029")!;
    renderWithProviders(<SubmitStep dossier={dossier} goTo={vi.fn()} />);
    const card = await screen.findByRole("region", { name: "Qua khu vực giám sát" }, T);
    expect(card.id).toBe("kvgs-1");
    expect(await within(card).findByRole("region", { name: "Khai danh sách container" }, T)).toBeTruthy();

    expect(screen.queryByRole("button", { name: /\((CONT_LIST|KVGS)\)$/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Gửi$/ })).toBeNull();
    // "Việc tiếp theo" (CONT_LIST khi NK container chưa được chấp nhận danh sách) trỏ tới thẻ thay vì gửi.
    const links = screen.getAllByRole("link", { name: "Mở thẻ Qua khu vực giám sát" });
    expect(links.length).toBeGreaterThan(0);
    for (const a of links) expect(a.getAttribute("href")).toBe("#kvgs-1");
  }, 30_000);
});
