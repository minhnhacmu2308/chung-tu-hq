// @vitest-environment jsdom
import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getDb, resetDb } from "@/mocks/db";
import { expectNoA11yViolations, renderWithProviders } from "@/test/dom";
import { DocumentPreview } from "./document-preview";

const T = { timeout: 5000 };

describe("DocumentPreview", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("có file gốc (backend): hiện đúng file PDF đã upload thay cho bản dựng lại; không vi phạm a11y", async () => {
    resetDb();
    const doc = { ...getDb().documents[0]!, fileName: "AWB_7704.pdf" };
    const fetchMock = vi.fn(async () => new Response(new Blob(["%PDF-1.4"], { type: "application/pdf" })));
    vi.stubGlobal("fetch", fetchMock);
    Object.assign(URL, { createObjectURL: vi.fn(() => "blob:original"), revokeObjectURL: vi.fn() });
    const { container } = renderWithProviders(<DocumentPreview document={doc} fileUrl={`/api/documents/${doc.id}/file`} fields={[]} />);
    const region = screen.getByRole("region", { name: /AWB_7704\.pdf/ });
    await waitFor(() => expect(region.querySelector("iframe")).not.toBeNull(), T);
    const frame = region.querySelector("iframe")!;
    expect(frame.title).toMatch(/AWB_7704\.pdf/);
    expect(frame.getAttribute("src")).toMatch(/^blob:original/);
    expect(fetchMock).toHaveBeenCalledWith(`/api/documents/${doc.id}/file`, { credentials: "same-origin" });
    expect(within(region).getByRole("link", { name: "Mở tab mới" }).getAttribute("href")).toBe("blob:original");
    await expectNoA11yViolations(container);
  });

  it("tải file lỗi: báo không mở được file, vẫn có link mở tab mới", async () => {
    resetDb();
    const doc = { ...getDb().documents[0]!, fileName: "scan.png" };
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 404 })));
    renderWithProviders(<DocumentPreview document={doc} fileUrl="/api/documents/x/file" fields={[]} />);
    await waitFor(() => expect(screen.getByText("Không mở được file gốc")).toBeTruthy(), T);
    expect(screen.getByRole("link", { name: "Mở tab mới" }).getAttribute("href")).toBe("/api/documents/x/file");
  });
});
