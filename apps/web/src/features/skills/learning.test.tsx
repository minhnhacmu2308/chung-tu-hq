// @vitest-environment jsdom
// Cách đọc chứng từ cho người dùng phổ thông: gợi ý AI đề xuất (đồng ý → thêm nhãn, gợi ý đọc lại chứng từ đang mở; bỏ qua),
// tình trạng bằng chữ, công tắc Nâng cao hiện cột kỹ thuật.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, resetDb } from "@/mocks/db";
import { expectNoA11yViolations, renderWithProviders } from "@/test/dom";
import { SkillStatusBadge, SuggestionsPanel } from "./learning";
import { SkillListPage } from "./skill-list-page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/skills",
  useSearchParams: () => new URLSearchParams(),
}));

const T = { timeout: 8000 };

beforeEach(() => {
  resetDb();
  try {
    localStorage.removeItem("kb-skills-advanced");
  } catch {
    /* bỏ qua */
  }
});

describe("SuggestionsPanel", () => {
  it("đồng ý → thêm nhãn vào trường, hết khỏi danh sách, hiện gợi ý đọc lại chứng từ đang mở; không vi phạm a11y", async () => {
    const db = getDb();
    const open = db.dossiers.find((d) => db.documents.some((x) => x.dossierId === d.id && x.kind === "INVOICE" && x.status === "DONE"))!;
    open.step = "ocr";
    const { container } = renderWithProviders(<SuggestionsPanel showSkill />);
    const row = (await screen.findByText("Số hóa đơn: thêm nhãn “Ref. Inv#”", undefined, T)).closest("li")!;
    expect(within(row).getByText(/Commercial Invoice – chung · KAIDA ELECTRIC CO., LTD · gặp 3 lần/)).toBeTruthy();
    await expectNoA11yViolations(container);
    await userEvent.click(await within(row).findByRole("button", { name: "Đồng ý" }, T));
    await waitFor(() => expect(getDb().skills.find((s) => s.id === "sk_inv_gen")!.fields.find((f) => f.key === "invoice_no")!.aliases).toContain("Ref. Inv#"), T);
    await waitFor(() => expect(screen.queryByText("Số hóa đơn: thêm nhãn “Ref. Inv#”")).toBeNull(), T);
    const reread = await screen.findByRole("button", { name: /^Đọc lại \d+ chứng từ$/ }, T);
    await userEvent.click(reread);
    await waitFor(() => expect(screen.queryByRole("button", { name: /^Đọc lại \d+ chứng từ$/ })).toBeNull(), T);
  }, 30_000);

  it("bỏ qua → gợi ý biến mất, skill không đổi", async () => {
    renderWithProviders(<SuggestionsPanel />);
    const row = (await screen.findByText("Tổng trị giá: thêm nhãn “TOTAL PRICE (USD)”", undefined, T)).closest("li")!;
    await userEvent.click(await within(row).findByRole("button", { name: "Bỏ qua" }, T));
    await waitFor(() => expect(screen.queryByText("Tổng trị giá: thêm nhãn “TOTAL PRICE (USD)”")).toBeNull(), T);
    expect(getDb().skills.find((s) => s.id === "sk_inv_gen")!.fields.find((f) => f.key === "total_amount")!.aliases).not.toContain("TOTAL PRICE (USD)");
  }, 30_000);
});

describe("SkillStatusBadge", () => {
  it("tình trạng bằng chữ kèm %: đọc tốt / khá / hay sai / cần thêm mẫu", () => {
    renderWithProviders(
      <>
        <SkillStatusBadge skill={{ accuracy: 0.97, labeledSamples: 20 }} />
        <SkillStatusBadge skill={{ accuracy: 0.92, labeledSamples: 20 }} />
        <SkillStatusBadge skill={{ accuracy: 0.8, labeledSamples: 20 }} />
        <SkillStatusBadge skill={{ accuracy: 0.99, labeledSamples: 2 }} />
      </>,
    );
    expect(screen.getByText(/^Đọc tốt · 97/)).toBeTruthy();
    expect(screen.getByText(/^Khá · 92/)).toBeTruthy();
    expect(screen.getByText(/^Hay sai · 80/)).toBeTruthy();
    expect(screen.getByText("Cần thêm mẫu")).toBeTruthy();
  });
});

describe("SkillListPage", () => {
  it("tên mới, gợi ý ở đầu trang; cột kỹ thuật chỉ hiện khi bật Nâng cao", async () => {
    renderWithProviders(<SkillListPage />);
    expect(await screen.findByRole("heading", { name: "Cách đọc chứng từ" }, T)).toBeTruthy();
    expect(await screen.findByText("AI đề xuất cải thiện", undefined, T)).toBeTruthy();
    await screen.findByRole("link", { name: "Commercial Invoice – chung" }, T);
    expect(screen.queryByRole("columnheader", { name: /Mã skill/ })).toBeNull();
    await userEvent.click(screen.getByRole("switch", { name: "Nâng cao" }));
    expect(await screen.findByRole("columnheader", { name: /Mã skill/ }, T)).toBeTruthy();
  }, 30_000);
});
