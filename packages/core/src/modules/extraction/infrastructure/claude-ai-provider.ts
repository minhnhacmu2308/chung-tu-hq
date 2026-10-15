// Adapter Claude: gửi PDF/ảnh dạng document block, structured output (output_config.format) sinh từ Zod; kết quả vẫn parse lại bằng Zod ở use case.
// Không dùng tool_choice ép tool: Claude Sonnet 5.5 / Opus 5.5 trả 400. Bật fallback phía server khi model từ chối (refusal).
// Model chỉ chép số, không tính; ghi uncertainties. Không retry ở đây (BullMQ retry theo lỗi tạm).
import Anthropic from "@anthropic-ai/sdk";
import { catalogHints, ClassifyResultSchema, fromAiOutput, toAiOutputSchema, type ClassifyResult, type DocKind } from "@kb/contracts";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { ZodType } from "zod";
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

/** Messages API nhận tối đa 32 MB/request; base64 làm file to thêm 4/3 → giới hạn file gốc ~23 MB (chừa chỗ cho prompt). */
export const MAX_AI_FILE_BYTES = 23 * 1024 * 1024;

function fileBlock(file: AiFile): Anthropic.ContentBlockParam {
  const data = file.bytes.toString("base64");
  if (file.mime === "application/pdf") return { type: "document", source: { type: "base64", media_type: "application/pdf", data } };
  const media = (file.mime === "image/png" ? "image/png" : "image/jpeg") as "image/png" | "image/jpeg";
  return { type: "image", source: { type: "base64", media_type: media, data } };
}

export class ClaudeAiProvider implements AiProvider {
  readonly name = "claude";
  private client: Anthropic;
  /** `clientOptions` chỉ để test (fetch giả). */
  constructor(apiKey: string, private model: string, clientOptions: { fetch?: typeof fetch; maxRetries?: number } = {}) {
    this.client = new Anthropic({ apiKey, ...clientOptions });
  }

  private async callStructured(file: AiFile, schema: ZodType, instruction: string): Promise<{ input: unknown; usage: AiUsage }> {
    if (file.bytes.length > MAX_AI_FILE_BYTES) throw new AiDataError(`File ${(file.bytes.length / 1024 / 1024).toFixed(1)} MB vượt giới hạn AI đọc được (${MAX_AI_FILE_BYTES / 1024 / 1024} MB) – tách file hoặc giảm độ phân giải scan rồi tải lại`);
    const res = await this.client.beta.messages.create({
      model: this.model,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      // ≤ 16 tham số union (giới hạn API): chữ/ngày nullable (và số trong `custom`) gửi dạng chuỗi, "" = không có → fromAiOutput đổi lại khi nhận.
      output_config: { format: zodOutputFormat(toAiOutputSchema(schema)) },
      // Model từ chối (refusal) → máy chủ tự chạy lại trên model dự phòng trong cùng lời gọi.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages: [{ role: "user", content: [fileBlock(file), { type: "text", text: instruction }] }],
    });
    if (res.stop_reason === "refusal") throw new AiDataError(`Model từ chối đọc chứng từ${res.stop_details?.category ? ` (${res.stop_details.category})` : ""}`);
    if (res.stop_reason === "max_tokens") throw new AiDataError("Chứng từ quá dài – kết quả bị cắt, tách file rồi thử lại");
    const text = res.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("");
    let input: unknown;
    try {
      input = fromAiOutput(schema, JSON.parse(text));
    } catch {
      throw new AiDataError("Model không trả dữ liệu có cấu trúc");
    }
    return { input, usage: { model: res.model, inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens } };
  }

  async classifyPages(file: AiFile) {
    const { input, usage } = await this.callStructured(file, ClassifyResultSchema, `File "${file.fileName}" có ${file.pages} trang. Phân loại từng trang thành các chứng từ (một file có thể chứa nhiều chứng từ; trang Duplicate/Triplicate/Copy đánh dấu isDuplicateCopy). Nếu nhận ra tên nhà cung cấp/hãng tàu, ghi vào supplierHint.`);
    const parsed = ClassifyResultSchema.safeParse(input);
    if (!parsed.success) throw new AiDataError("Kết quả phân loại không đúng cấu trúc");
    return { result: parsed.data as ClassifyResult, usage };
  }

  async extract(file: AiFile, pages: number[], schema: ZodType, prompt: ExtractPrompt) {
    // Gợi ý theo skill của doanh nghiệp; chưa có thì theo danh mục trường chuẩn (chuẩn đọc chung mọi khách hàng).
    const hintLines = prompt.skillHints.length ? prompt.skillHints : catalogHints(prompt.kind);
    const hints = `\nTrường cần chú ý (nhãn thường gặp): ${hintLines.join("; ")}.`;
    const supplier = prompt.supplierHint ? `\nNhà cung cấp: ${prompt.supplierHint}.` : "";
    const examples = prompt.examples.length ? `\nVí dụ đã duyệt (tham khảo cách đọc):\n${JSON.stringify(prompt.examples.slice(0, 2))}` : "";
    const { input, usage } = await this.callStructured(file, schema, `Đây là ${KIND_VI[prompt.kind]}, đọc các trang ${pages.join(", ")} của file "${file.fileName}".${hints}${supplier}${examples}`);
    return { result: input, regions: null, usage };
  }
}
