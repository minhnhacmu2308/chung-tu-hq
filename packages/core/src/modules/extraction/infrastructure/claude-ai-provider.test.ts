import { customFieldsOf, DocKindSchema, extractionSchemaFor, withCustomFields } from "@kb/contracts";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { describe, expect, it } from "vitest";
import { AiDataError } from "../application/ports.js";
import { ClaudeAiProvider, MAX_AI_FILE_BYTES, toRegions } from "./claude-ai-provider.js";
import { scanPdf, textPdf } from "./test/pdfs.js";

const FILE = { bytes: Buffer.from("%PDF-1.4 mock"), mime: "application/pdf", pages: 2, fileName: "Commercial Invoice.pdf" };
const CLASSIFY = { documents: [{ kind: "INVOICE", pages: [1, 2], isDuplicateCopy: false, supplierHint: "HANSOL" }] };

/** fetch giả: ghi lại body và header gửi đi, trả một Message của Messages API. */
function fakeApi(reply: { text?: string; stop_reason?: string; model?: string; stop_details?: unknown }) {
  const sent: { body: Record<string, unknown>; headers: Headers }[] = [];
  const fetchFn = (async (_url: string | URL | Request, init?: RequestInit) => {
    sent.push({ body: JSON.parse(String(init?.body)) as Record<string, unknown>, headers: new Headers(init?.headers) });
    const msg = {
      id: "msg_1", type: "message", role: "assistant", model: reply.model ?? "claude-sonnet-5-5", stop_reason: reply.stop_reason ?? "end_turn", stop_sequence: null, stop_details: reply.stop_details ?? null,
      content: reply.text === undefined ? [] : [{ type: "text", text: reply.text }], usage: { input_tokens: 1200, output_tokens: 80 },
    };
    return new Response(JSON.stringify(msg), { status: 200, headers: { "content-type": "application/json", "request-id": "req_1" } });
  }) as typeof fetch;
  return { fetchFn, sent };
}
const provider = (f: typeof fetch) => new ClaudeAiProvider("sk-test", "claude-sonnet-5-5", { fetch: f, maxRetries: 0 });

describe("ClaudeAiProvider", () => {
  it.each(DocKindSchema.options)("schema %s (v2) chuyển được sang structured output", (kind) => {
    expect(() => zodOutputFormat(extractionSchemaFor(kind) as never)).not.toThrow();
  });
  it("gửi PDF dạng document + structured output, KHÔNG ép tool_choice (Sonnet 5.5 trả 400), bật fallback khi từ chối", async () => {
    const api = fakeApi({ text: JSON.stringify(CLASSIFY) });
    const r = await provider(api.fetchFn).classifyPages(FILE);
    expect(r.result.documents[0]).toMatchObject({ kind: "INVOICE", pages: [1, 2] });
    expect(r.usage).toEqual({ model: "claude-sonnet-5-5", inputTokens: 1200, outputTokens: 80 });
    const { body, headers } = api.sent[0]!;
    expect(body["model"]).toBe("claude-sonnet-5-5");
    expect(body["tool_choice"]).toBeUndefined();
    expect(body["tools"]).toBeUndefined();
    expect((body["output_config"] as { format: { type: string } }).format.type).toBe("json_schema");
    expect(body["fallbacks"]).toBe("default");
    expect(headers.get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
    const content = (body["messages"] as { content: { type: string; source?: { media_type: string } }[] }[])[0]!.content;
    expect(content[0]).toMatchObject({ type: "document", source: { media_type: "application/pdf" } });
  });

  it("extract trả JSON đã parse; usage ghi đúng model thực chạy (khi fallback sang model khác)", async () => {
    const api = fakeApi({ text: JSON.stringify({ invoiceNo: "HS-001" }), model: "claude-opus-5-5" });
    const r = await provider(api.fetchFn).extract(FILE, [1], extractionSchemaFor("INVOICE"), { kind: "INVOICE", skillHints: ["Invoice No."], examples: [], supplierHint: "HANSOL" });
    expect(r.result).toEqual({ invoiceNo: "HS-001" });
    expect(r.usage.model).toBe("claude-opus-5-5");
    const text = (api.sent[0]!.body["messages"] as { content: { type: string; text?: string }[] }[])[0]!.content[1]!.text!;
    expect(text).toContain("Commercial Invoice");
    expect(text).toContain("Invoice No.");
  });

  it("schema gửi AI ≤ 16 union: trường chữ nullable gửi dạng chuỗi; AI trả \"\" → kết quả null", async () => {
    const api = fakeApi({ text: JSON.stringify({ billNo: "FANS25040166", vessel: "", masterBillNo: "" }) });
    const r = await provider(api.fetchFn).extract(FILE, [1], extractionSchemaFor("ARRIVAL_NOTICE"), { kind: "ARRIVAL_NOTICE", skillHints: [], examples: [], supplierHint: null });
    expect(r.result).toMatchObject({ billNo: "FANS25040166", vessel: null, masterBillNo: null });
    const sent = JSON.stringify(api.sent[0]!.body["output_config"]);
    expect(sent).not.toContain('"masterBillNo":{"anyOf"');
  });

  it("trường bổ sung kiểu số gửi AI dạng chuỗi → kết quả trả về là số (khớp schema gốc)", async () => {
    const schema = withCustomFields(extractionSchemaFor("PACKING_LIST"), customFieldsOf("PACKING_LIST", [{ key: "cbm", label: "Thể tích", type: "decimal", required: false, aliases: [], extract: true, display: true }]));
    const api = fakeApi({ text: JSON.stringify({ custom: { cbm: "1.25" } }) });
    const r = await provider(api.fetchFn).extract(FILE, [1], schema, { kind: "PACKING_LIST", skillHints: [], examples: [], supplierHint: null });
    expect((r.result as { custom: unknown }).custom).toEqual({ cbm: 1.25 });
  });
  it("không có gợi ý từ skill → dùng nhãn danh mục chuẩn (nhãn tiếng Việt + nhãn thường gặp) trong prompt", async () => {
    const api = fakeApi({ text: JSON.stringify({ billNo: "X" }) });
    await provider(api.fetchFn).extract(FILE, [1], extractionSchemaFor("ARRIVAL_NOTICE"), { kind: "ARRIVAL_NOTICE", skillHints: [], examples: [], supplierHint: null });
    const text = (api.sent[0]!.body["messages"] as { content: { type: string; text?: string }[] }[])[0]!.content[1]!.text!;
    expect(text).toContain("Vận đơn chính (MB/L)");
    expect(text).toContain("Kho / CY");
  });

  it("file vượt giới hạn request của Claude → AiDataError rõ ràng, không gọi API", async () => {
    const api = fakeApi({ text: "{}" });
    const big = { ...FILE, bytes: Buffer.alloc(MAX_AI_FILE_BYTES + 1) };
    await expect(provider(api.fetchFn).classifyPages(big)).rejects.toThrow(/vượt giới hạn AI đọc được/);
    expect(api.sent).toHaveLength(0);
  });

  it.each([
    [{ stop_reason: "refusal", stop_details: { type: "refusal", category: "cyber", explanation: "" } }, /từ chối.*cyber/],
    [{ stop_reason: "max_tokens", text: "{\"documents\": [" }, /quá dài/],
    [{ text: "không phải JSON" }, /không trả dữ liệu có cấu trúc/],
  ])("phản hồi bất thường %j → AiDataError (không retry)", async (reply, message) => {
    const api = fakeApi(reply);
    const p = provider(api.fetchFn).classifyPages(FILE);
    await expect(p).rejects.toBeInstanceOf(AiDataError);
    await expect(p).rejects.toThrow(message);
  });
  it("PDF chuẩn (có lớp chữ): KHÔNG xin tọa độ – không có _regions trong schema lẫn lời nhắc", async () => {
    const api = fakeApi({ text: JSON.stringify({ invoiceNo: "INV-001" }) });
    const r = await provider(api.fetchFn).extract({ ...FILE, bytes: await textPdf(), pages: 1 }, [1], extractionSchemaFor("INVOICE"), { kind: "INVOICE", skillHints: [], examples: [], supplierHint: null });
    expect(r.regions).toBeNull();
    expect(JSON.stringify(api.sent[0]!.body["output_config"])).not.toContain("_regions");
    const text = (api.sent[0]!.body["messages"] as { content: { type: string; text?: string }[] }[])[0]!.content[1]!.text!;
    expect(text).not.toContain("_regions");
  });

  it("PDF scan: xin _regions; kết quả tách tọa độ (thang 0–1000 → % trang), dữ liệu không lẫn _regions", async () => {
    const reply = { invoiceNo: "INV-001", _regions: [{ key: "invoiceNo", page: 1, x0: 100, y0: 200, x1: 300, y1: 250 }, { key: "items.0.hsCodeOnInvoice", page: 1, x0: 500, y0: 600, x1: 600, y1: 620 }] };
    const api = fakeApi({ text: JSON.stringify(reply) });
    const r = await provider(api.fetchFn).extract({ ...FILE, bytes: await scanPdf(), pages: 1 }, [1], extractionSchemaFor("INVOICE"), { kind: "INVOICE", skillHints: [], examples: [], supplierHint: null });
    expect(r.result).toEqual({ invoiceNo: "INV-001" });
    expect(r.regions).toEqual({ invoiceNo: { page: 1, x: 10, y: 20, w: 20, h: 5 }, "items.0.hsOnInvoice": { page: 1, x: 50, y: 60, w: 10, h: 2 } });
    expect(JSON.stringify(api.sent[0]!.body["output_config"])).toContain("_regions");
  });

  it("ảnh chụp: cũng xin tọa độ", async () => {
    const api = fakeApi({ text: JSON.stringify({ invoiceNo: "X", _regions: [] }) });
    const r = await provider(api.fetchFn).extract({ ...FILE, mime: "image/jpeg", pages: 1 }, [1], extractionSchemaFor("INVOICE"), { kind: "INVOICE", skillHints: [], examples: [], supplierHint: null });
    expect(r.regions).toBeNull();
    expect(JSON.stringify(api.sent[0]!.body["output_config"])).toContain("_regions");
  });

  it("regions: false (luồng không có màn OCR) → ảnh/scan cũng không xin tọa độ", async () => {
    const api = fakeApi({ text: JSON.stringify({ invoiceNo: "X" }) });
    const r = await provider(api.fetchFn).extract({ ...FILE, mime: "image/jpeg", pages: 1 }, [1], extractionSchemaFor("INVOICE"), { kind: "INVOICE", skillHints: [], examples: [], supplierHint: null, regions: false });
    expect(r.result).toEqual({ invoiceNo: "X" });
    expect(JSON.stringify(api.sent[0]!.body["output_config"])).not.toContain("_regions");
  });

  it("toRegions bỏ khung sai trang, méo, sai cấu trúc; kẹp vào trang; trùng khóa lấy khung đầu", () => {
    expect(toRegions("x", 1)).toBeNull();
    expect(toRegions([{ key: "a", page: 3, x0: 0, y0: 0, x1: 10, y1: 10 }, { key: "b", page: 1, x0: 50, y0: 50, x1: 40, y1: 60 }], 2)).toBeNull();
    expect(toRegions([{ key: "a", page: 2, x0: -20, y0: 900, x1: 100, y1: 1200 }, { key: "a", page: 1, x0: 0, y0: 0, x1: 10, y1: 10 }], 2)).toEqual({ a: { page: 2, x: 0, y: 90, w: 10, h: 10 } });
  });
});
