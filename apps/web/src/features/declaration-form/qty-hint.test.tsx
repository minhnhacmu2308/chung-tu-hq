// @vitest-environment jsdom
// Chú thích quy đổi lượng ở dòng tờ khai (ADR 0015): ĐVT invoice khác ĐVT khai → "n ĐVT × hệ số = lượng ĐVT khai (theo danh mục | theo lô)";
// sửa hệ số theo lô (PUT unit-factor) → tính lại; lệch > 20% → cảnh báo (không chặn). Chỉ xem → không có ô sửa.
import type { LineItem } from "@kb/contracts";
import { useQuery } from "@tanstack/react-query";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { declarationKeys, listLineItems } from "@/api/declaration";
import { refreshLineQuantity2 } from "@/mocks/api/catalog";
import { getDb, resetDb } from "@/mocks/db";
import { expectNoA11yViolations, renderWithProviders } from "@/test/dom";
import { QtySuggestionHint } from "./qty-hint";

const T = { timeout: 8000 };

function Harness({ dossierId, lineId, editable }: { dossierId: string; lineId: string; editable: boolean }) {
  const q = useQuery({ queryKey: declarationKeys.items(dossierId), queryFn: () => listLineItems(dossierId) });
  const it = q.data?.find((x: LineItem) => x.id === lineId);
  return it ? <QtySuggestionHint item={it} dossierId={dossierId} editable={editable} /> : null;
}

let line: LineItem;
beforeEach(() => {
  resetDb();
  const db = getDb();
  const dossier = db.dossiers.find((d) => d.id === db.agentRuns[0]!.dossierId)!;
  dossier.status = "NEEDS_REVIEW"; // tờ khai chưa duyệt → sửa được hệ số lô
  line = db.lineItems.find((i) => i.dossierId === dossier.id && i.lineNo === 1)!;
  // Dây cáp CVV 3x2.5: ĐVT gốc MTR, mã XNK theo MTR, quy đổi 1 ROL = 100 MTR. Invoice ghi 2 cuộn.
  const item = db.catalog.items.find((i) => i.name === "Dây cáp điện CVV 3x2.5mm2")!;
  Object.assign(line, { quantity: "2", unit: "ROL", catalogItem: { id: item.id, itemNo: item.itemNo, name: item.name } });
  delete line.unitFactor;
});

describe("QtySuggestionHint – lượng quy đổi sang ĐVT khai", () => {
  it("hệ số danh mục → phép tính; nhập hệ số lô lệch > 20% → tính theo lô + cảnh báo; dùng lại hệ số danh mục; a11y", async () => {
    const { container } = renderWithProviders(<Harness dossierId={line.dossierId} lineId={line.id} editable />);
    expect(await screen.findByText("2 ROL × 100 = 200 MTR (theo danh mục)", undefined, T)).toBeTruthy();
    expect(screen.queryByText(/lệch hơn 20%/)).toBeNull();
    await expectNoA11yViolations(container);

    await userEvent.type(screen.getByLabelText("Hệ số theo lô: 1 ROL = ? ĐVT gốc"), "150");
    await userEvent.click(screen.getByRole("button", { name: "Lưu hệ số lô" }));
    expect(await screen.findByText("2 ROL × 150 = 300 MTR (theo lô)", undefined, T)).toBeTruthy();
    expect(screen.getByText(/lệch hơn 20%/)).toBeTruthy();
    expect(getDb().lineItems.find((i) => i.id === line.id)!.unitFactor).toBe("150");

    await userEvent.click(screen.getByRole("button", { name: "Dùng hệ số danh mục" }));
    expect(await screen.findByText("2 ROL × 100 = 200 MTR (theo danh mục)", undefined, T)).toBeTruthy();
    await waitFor(() => expect(getDb().lineItems.find((i) => i.id === line.id)!.unitFactor).toBeUndefined(), T);
  }, 60_000);

  it.each([
    ["en", "2 ROL × 100 = 200 MTR (catalog factor)"],
    ["zh", "2 ROL × 100 = 200 MTR（按目录）"],
  ] as const)("ngôn ngữ %s: phép tính đã dịch", async (locale, text) => {
    renderWithProviders(<Harness dossierId={line.dossierId} lineId={line.id} editable />, locale);
    expect(await screen.findByText(text, undefined, T)).toBeTruthy();
  }, 30_000);

  it("mặt hàng có ĐVT số lượng 2: thêm dòng Số lượng (2) (hệ số lô tính vào); không có gợi ý lượng vẫn hiện riêng; a11y", async () => {
    // 1 MTR = 0,15 KGM → 1 ROL = 15 KGM.
    Object.assign(getDb().catalog.items.find((i) => i.name === "Dây cáp điện CVV 3x2.5mm2")!, { qty2Unit: "KGM", qty2Factor: "0.15" });
    // Số lượng (2) là giá trị LƯU trên dòng (như line_items.quantity2): gắn mặt hàng / đồng bộ mới tính.
    refreshLineQuantity2(getDb(), getDb().lineItems.find((i) => i.id === line.id)!);
    const { container, unmount } = renderWithProviders(<Harness dossierId={line.dossierId} lineId={line.id} editable />);
    expect(await screen.findByText("2 ROL × 100 = 200 MTR (theo danh mục)", undefined, T)).toBeTruthy();
    expect(screen.getByText("Số lượng (2): 2 ROL × 15 = 30 KGM (theo danh mục)")).toBeTruthy();
    await expectNoA11yViolations(container);
    await userEvent.type(screen.getByLabelText("Hệ số theo lô: 1 ROL = ? ĐVT gốc"), "120");
    await userEvent.click(screen.getByRole("button", { name: "Lưu hệ số lô" }));
    expect(await screen.findByText("Số lượng (2): 2 ROL × 18 = 36 KGM (theo danh mục)", undefined, T)).toBeTruthy();
    unmount();
    // Dòng đã theo ĐVT khai (MTR) → không có gợi ý lượng, chỉ Số lượng (2).
    const stored = getDb().lineItems.find((i) => i.id === line.id)!;
    Object.assign(stored, { unit: "MTR", quantity: "200" });
    refreshLineQuantity2(getDb(), stored);
    const r2 = renderWithProviders(<Harness dossierId={line.dossierId} lineId={line.id} editable />);
    expect(await screen.findByText("Số lượng (2) theo danh mục", undefined, T)).toBeTruthy();
    expect(screen.getByText("Số lượng (2): 200 MTR × 0,15 = 30 KGM (theo danh mục)")).toBeTruthy();
    expect(screen.queryByLabelText(/Hệ số theo lô/)).toBeNull();
    await expectNoA11yViolations(r2.container);
  }, 60_000);

  it("chỉ xem: có phép tính, không có ô hệ số lô; cùng ĐVT → không hiện gì", async () => {
    const { unmount } = renderWithProviders(<Harness dossierId={line.dossierId} lineId={line.id} editable={false} />);
    expect(await screen.findByText("2 ROL × 100 = 200 MTR (theo danh mục)", undefined, T)).toBeTruthy();
    expect(screen.queryByLabelText(/Hệ số theo lô/)).toBeNull();
    unmount();
    line.unit = "MTR";
    expect((await listLineItems(line.dossierId)).find((i) => i.id === line.id)!.qtySuggestion).toBeUndefined();
    const { container } = renderWithProviders(<QtySuggestionHint item={{ ...line }} dossierId={line.dossierId} editable />);
    expect(container.querySelector("main")!.textContent).toBe("");
  }, 30_000);
});
