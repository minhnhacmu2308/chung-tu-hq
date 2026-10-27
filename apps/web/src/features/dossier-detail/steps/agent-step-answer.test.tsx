// @vitest-environment jsdom
// Hộp "Trả lời AI": dòng hàng giống nhau đang chờ cùng câu hỏi → trả lời một lần áp cho tất cả (mặc định bật, bỏ chọn được).
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, resetDb } from "@/mocks/db";
import { expectNoA11yViolations, renderWithProviders } from "@/test/dom";
import { AgentStep } from "./agent-step";

const T = { timeout: 8000 };

function setup() {
  resetDb();
  const db = getDb();
  const run = db.agentRuns[0]!;
  const dossier = db.dossiers.find((d) => d.id === run.dossierId)!;
  dossier.status = "NEEDS_REVIEW";
  // Hai dòng thanh trượt (khác số lượng/trị giá) → mock HSCodePro hỏi cùng một câu.
  const lines = db.lineItems.filter((i) => i.dossierId === dossier.id).slice(0, 2);
  lines.forEach((l, k) => {
    l.id = `li_answer_${k}`;
    l.description = `Linear guide rail HGR20 L=${k ? 600 : 400}mm`;
    delete l.hsConfirmed;
  });
  return { dossier, lines };
}

describe("AgentStep – trả lời AI một lần cho hàng giống nhau", () => {
  beforeEach(() => vi.useRealTimers());

  it("có ô 'Áp dụng cho 1 dòng hàng giống nhau', gửi → cả 2 dòng được trả lời; không vi phạm a11y", async () => {
    const { dossier, lines } = setup();
    renderWithProviders(<AgentStep dossier={dossier} goTo={vi.fn()} />);
    await userEvent.click(await screen.findByRole("button", { name: `Trả lời AI cho dòng ${lines[0]!.lineNo}` }, T));
    const dialog = await screen.findByRole("dialog", undefined, T);
    const apply = screen.getByRole("checkbox", { name: `Áp dụng cho 1 dòng hàng giống nhau cùng câu hỏi: dòng ${lines[1]!.lineNo}` });
    expect((apply as HTMLInputElement).checked).toBe(true);
    await expectNoA11yViolations(dialog);
    await userEvent.click(screen.getByRole("radio", { name: /Máy công cụ/ }));
    await userEvent.click(screen.getByRole("button", { name: "Gửi câu trả lời" }));
    expect(await screen.findByText("Đã gửi câu trả lời cho 2 dòng", undefined, T)).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole("button", { name: `Trả lời AI cho dòng ${lines[1]!.lineNo}` })).toBeNull(), T);
  }, 30_000);
});
