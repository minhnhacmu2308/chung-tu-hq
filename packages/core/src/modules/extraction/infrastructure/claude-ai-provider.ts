// Adapter Claude: gửi PDF/ảnh dạng document block, structured output bằng tool có input_schema sinh từ Zod (z.toJSONSchema).
// Model chỉ chép số, không tính; ghi uncertainties. Không retry ở đây (BullMQ retry theo lỗi tạm).
import Anthropic from "@anthropic-ai/sdk";
import { ClassifyResultSchema, type ClassifyResult, type DocKind } from "@kb/contracts";
import { z, type ZodType } from "zod";
import { AiDataError, PROMPT_VERSION, type AiFile, type AiProvider, type AiUsage, type ExtractPrompt } from "../application/ports.js";

const KIND_VI: Record<DocKind, string> = {
  INVOICE: "Commercial Invoice (hóa đơn thương mại)", PACKING_LIST: "Packing List", BILL_OF_LADING: "Bill of Lading (vận đơn đường biển)", AIR_WAYBILL: "Air Waybill",
  CERT_OF_ORIGIN: "Certificate of Origin (C/O)", SALES_CONTRACT: "Sales Contract (hợp đồng mua bán)", ARRIVAL_NOTICE: "Arrival Notice (thông báo hàng đến)",
  FREIGHT_INVOICE: "Hóa đơn cước vận chuyển (GTGT)", OTHER: "Chứng từ khác",
};

export const SYSTEM_PROMPT = `Bạn là nhân viên chứng từ xuất nhập khẩu giàu kinh nghiệm. Nhiệm vụ: đọc chứng từ thương mại (có thể là scan, nhiều ngôn ngữ Anh/Việt/Trung/Hàn) và CHÉP CHÍNH XÁC dữ liệu vào cấu trúc yêu cầu.
Quy tắc (phiên bản ${PROMPT_VERSION}):
1. Chép nguyên văn, không suy đoán, không tự tính tổng/thuế. Số: quy đổi dấu phân cách theo quy ước của chứng từ (EU "1.234,56" / US "1,234.56") thành số thập phân; ngày về YYYY-MM-DD (chú ý thứ tự ngày/tháng theo xuất xứ chứng từ).
2. Mã định danh (số invoice, vận đơn, C/O, container, mã số thuế, mã HS) giữ nguyên ký tự, không bỏ số 0 đầu.
3. Trường không có trên chứng từ → null. Không để trống chuỗi.
4. Trường chữ mờ, nhiều giá trị mâu thuẫn, hoặc phải suy luận → vẫn điền giá trị khả dĩ nhất và ghi TÊN TRƯỜNG vào "uncertainties".
5. Bản Duplicate/Triplicate/Copy của cùng chứng từ chỉ đọc một lần.`;

function toolSchema(schema: ZodType) {
  const json = z.toJSONSchema(schema, { target: "draft-7", unrepresentable: "any" }) as Record<string, unknown>;
  delete json["$schema"];
  return json as Anthropic.Tool["input_schema"];
}

function fileBlock(file: AiFile): Anthropic.ContentBlockParam {
  const data = file.bytes.toString("base64");
  if (file.mime === "application/pdf") return { type: "document", source: { type: "base64", media_type: "application/pdf", data } };
  const media = (file.mime === "image/png" ? "image/png" : "image/jpeg") as "image/png" | "image/jpeg";
  return { type: "image", source: { type: "base64", media_type: media, data } };
}

export class ClaudeAiProvider implements AiProvider {
  readonly name = "claude";
  private client: Anthropic;
  constructor(apiKey: string, private model: string) {
    this.client = new Anthropic({ apiKey });
  }

  private async callTool(file: AiFile, schema: ZodType, toolName: string, instruction: string): Promise<{ input: unknown; usage: AiUsage }> {
    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      tools: [{ name: toolName, description: "Ghi dữ liệu đã đọc được vào cấu trúc.", input_schema: toolSchema(schema) }],
      tool_choice: { type: "tool", name: toolName },
      messages: [{ role: "user", content: [fileBlock(file), { type: "text", text: instruction }] }],
    });
    const block = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (!block) throw new AiDataError("Model không trả dữ liệu có cấu trúc");
    return { input: block.input, usage: { model: res.model, inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens } };
  }

  async classifyPages(file: AiFile) {
    const { input, usage } = await this.callTool(file, ClassifyResultSchema, "classify_pages", `File "${file.fileName}" có ${file.pages} trang. Phân loại từng trang thành các chứng từ (một file có thể chứa nhiều chứng từ; trang Duplicate/Triplicate/Copy đánh dấu isDuplicateCopy). Nếu nhận ra tên nhà cung cấp/hãng tàu, ghi vào supplierHint.`);
    const parsed = ClassifyResultSchema.safeParse(input);
    if (!parsed.success) throw new AiDataError("Kết quả phân loại không đúng cấu trúc");
    return { result: parsed.data as ClassifyResult, usage };
  }

  async extract(file: AiFile, pages: number[], schema: ZodType, prompt: ExtractPrompt) {
    const hints = prompt.skillHints.length ? `\nTrường cần chú ý (nhãn thường gặp): ${prompt.skillHints.join("; ")}.` : "";
    const supplier = prompt.supplierHint ? `\nNhà cung cấp: ${prompt.supplierHint}.` : "";
    const examples = prompt.examples.length ? `\nVí dụ đã duyệt (tham khảo cách đọc):\n${JSON.stringify(prompt.examples.slice(0, 2))}` : "";
    const { input, usage } = await this.callTool(file, schema, "extract_document", `Đây là ${KIND_VI[prompt.kind]}, đọc các trang ${pages.join(", ")} của file "${file.fileName}".${hints}${supplier}${examples}`);
    return { result: input, regions: null, usage };
  }
}
