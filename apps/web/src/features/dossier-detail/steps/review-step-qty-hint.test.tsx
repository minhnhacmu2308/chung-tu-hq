// @vitest-environment jsdom
// Bước Review (bản in → panel sửa ô): dòng đã gắn mặt hàng danh mục, ĐVT invoice khác ĐVT khai → panel ô số lượng 1.83 hiện
// "Lượng theo ĐVT khai" (gợi ý từ getDeclarationView – ADR 0015); ô khác của dòng không hiện.
import { screen, waitFor, within } from "@testing-library/react";
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
const T = { timeout: 45_000 };
const dossier = () => getDb().dossiers.find((d) => d.id === "dos_028")!;
const dialog = () => waitFor(() => { const d = document.querySelector<HTMLElement>("[role=dialog]"); if (!d) throw new Error("no dialog"); return d; }, T);
const cell = (id: string) => document.querySelector<HTMLElement>(`[data-print-cell="${id}"]`)!;

beforeEach(() => {
  resetDb();
  const db = getDb();
  db.declarations.find((x) => x.dossierId === "dos_028")!.status = "DRAFT";
  const line = db.lineItems.filter((i) => i.dossierId === "dos_028").sort((a, b) => a.lineNo - b.lineNo)[0]!;
  // Dây cáp CVV 3x2.5: mã XNK theo MTR, 1 ROL = 100 MTR. Invoice ghi 2 cuộn.
  const item = db.catalog.items.find((i) => i.name === "Dây cáp điện CVV 3x2.5mm2")!;
  Object.assign(line, { quantity: "2", unit: "ROL", catalogItem: { id: item.id, itemNo: item.itemNo, name: item.name } });
  delete line.unitFactor;
});

describe("ReviewStep – gợi ý lượng theo ĐVT khai trong panel sửa ô", () => {
  it("ô 1.83 (HAG_QN1) dòng 1 → hiện phép quy đổi; ô mô tả hàng (HAG_CMD) → không hiện", async () => {
    renderWithProviders(<ReviewStep dossier={dossier()} goTo={vi.fn()} />);
    await screen.findAllByText("Bản nháp, chờ duyệt", {}, T);
    await waitFor(() => expect(cell("0:HAG_QN1")).toBeTruthy(), T);
    await userEvent.click(cell("0:HAG_QN1"));
    let panel = await dialog();
    expect(within(panel).getByText("Lượng theo ĐVT khai")).toBeTruthy();
    expect(within(panel).getByText("2 ROL × 100 = 200 MTR (theo danh mục)")).toBeTruthy();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(document.querySelector("[role=dialog]")).toBeNull(), T);
    await userEvent.click(cell("0:HAG_CMD"));
    panel = await dialog();
    expect(within(panel).queryByText("Lượng theo ĐVT khai")).toBeNull();
  }, 120_000);
});
