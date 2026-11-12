import { describe, expect, it } from "vitest";
import { defaultDocumentSources, mergeDocumentSources } from "../document-sources.js";

describe("defaultDocumentSources", () => {
  it("XK đường biển: vận đơn đường biển có sau khi khai", () => {
    expect(defaultDocumentSources("XK", "SEA_CONTAINER")).toEqual({ BILL_OF_LADING: "PENDING_AFTER_DECLARATION" });
    expect(defaultDocumentSources("XK", "SEA_BULK")).toEqual({ BILL_OF_LADING: "PENDING_AFTER_DECLARATION" });
  });
  it("XK hàng không: AWB có sau khi khai", () => {
    expect(defaultDocumentSources("XK", "AIR")).toEqual({ AIR_WAYBILL: "PENDING_AFTER_DECLARATION" });
  });
  it("XK đường bộ / giao tại chỗ và mọi hồ sơ NK: như cũ (tải lên)", () => {
    expect(defaultDocumentSources("XK", "ROAD")).toEqual({});
    expect(defaultDocumentSources("XK", "OTHER")).toEqual({});
    expect(defaultDocumentSources("NK", "SEA_CONTAINER")).toEqual({});
  });
});

describe("mergeDocumentSources", () => {
  it("gộp vào nguồn hiện có; UPLOADED xóa đánh dấu", () => {
    const r = mergeDocumentSources("XK", { BILL_OF_LADING: "PENDING_AFTER_DECLARATION" }, { CERT_OF_ORIGIN: "PENDING_AFTER_DECLARATION", BILL_OF_LADING: "UPLOADED" });
    expect(r).toEqual({ ok: true, value: { CERT_OF_ORIGIN: "PENDING_AFTER_DECLARATION" } });
  });
  it("hồ sơ NK không được đánh dấu có sau khi khai", () => {
    const r = mergeDocumentSources("NK", {}, { BILL_OF_LADING: "PENDING_AFTER_DECLARATION" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("VALIDATION");
  });
  it("loại chứng từ không đến sau tờ khai (invoice) bị từ chối", () => {
    const r = mergeDocumentSources("XK", {}, { INVOICE: "PENDING_AFTER_DECLARATION" });
    expect(r.ok).toBe(false);
  });
});
