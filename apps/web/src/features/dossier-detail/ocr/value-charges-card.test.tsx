// @vitest-environment jsdom
// Khoản chi phí / điều chỉnh là chỉ tiêu chung: lô nhiều tờ chỉ gọi về một số tờ → chỉ xem, kèm lý do COMMON_LOCKED_SHEETS.
import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SubmissionView } from "@kb/contracts";
import { getDb, resetDb } from "@/mocks/db";
import { renderWithProviders } from "@/test/dom";
import { branch, submissionOf } from "@/test/branch-submission";
import { ValueChargesCard } from "./value-charges-card";

const api = vi.hoisted(() => ({ current: null as SubmissionView | null }));
vi.mock("@/api/customs", async (orig) => ({ ...(await orig<typeof import("@/api/customs")>()), getSubmission: async () => api.current! }));

const T = { timeout: 20_000 };
beforeEach(() => {
  resetDb();
  getDb().declarations.find((x) => x.dossierId === "dos_028")!.status = "DRAFT";
  getDb().dossiers.find((d) => d.id === "dos_028")!.status = "NEEDS_REVIEW";
});

describe("ValueChargesCard – phạm vi sửa", () => {
  it("chỉ tờ 2 gọi về → chỉ xem + lý do, không có nút sửa", async () => {
    api.current = submissionOf([branch(1, 3, "PRE_DECLARED"), branch(2, 3, "RECALLED"), branch(3, 3, "PRE_DECLARED")], { declarationStatus: "DRAFT" });
    renderWithProviders(<ValueChargesCard dossierId="dos_028" currency="USD" />);
    expect(await screen.findByText("Thông tin chung: tờ 1, 3 chưa gọi về – gọi về tất cả tờ để sửa chi phí.", {}, T)).toBeTruthy();
    expect(screen.queryByText("Sửa chi phí")).toBeNull();
  }, 60_000);
  it("gọi về tất cả → sửa được như cũ", async () => {
    api.current = submissionOf([branch(1, 3, "RECALLED"), branch(2, 3, "RECALLED"), branch(3, 3, "RECALLED")], { declarationStatus: "DRAFT" });
    renderWithProviders(<ValueChargesCard dossierId="dos_028" currency="USD" />);
    expect(await screen.findByText("Sửa chi phí", {}, T)).toBeTruthy();
    expect(screen.queryByText(/chưa gọi về/)).toBeNull();
  }, 60_000);
});
