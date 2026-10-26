// AI soạn mẫu email theo mô tả của quản trị viên (ADR 0008). Nằm ở extraction/infrastructure vì mọi lời gọi SDK AI gom một chỗ
// (depcruise ai-sdk-only-in-extraction-infra); module admin nhận qua port EmailDraftAi do container nối. Chỉ nhận mô tả người soạn gõ – không có dữ liệu khách hàng nào trong prompt.
// Structured output dạng phẳng (giới hạn số union của API) → đổi sang khối email; use case kiểm lại bằng schema chuẩn trước khi trả về.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

const AiBlock = z.object({
  type: z.enum(["heading", "text", "button", "divider", "spacer"]),
  /** heading/text: nội dung; button: chữ trên nút; divider/spacer: "". */
  text: z.string(),
  /** Chỉ cho button: liên kết (https://… hoặc biến {{loginUrl}} không có → dùng https://ct-hq.aixuatnhapkhau.cloud). */
  url: z.string(),
  align: z.enum(["left", "center", "right"]),
});
const AiOutput = z.object({ subject: z.string(), preheader: z.string(), blocks: z.array(AiBlock) });

const TONE: Record<string, string> = {
  FORMAL: "trang trọng, lịch sự kiểu thư doanh nghiệp",
  FRIENDLY: "thân thiện, gần gũi nhưng vẫn chuyên nghiệp",
  SHORT: "ngắn gọn, đi thẳng vào việc (tối đa 3 đoạn)",
};
const LANG: Record<string, string> = { vi: "tiếng Việt", en: "English", zh: "简体中文" };

const SYSTEM = `Bạn soạn email cho KhaiBáo AI – phần mềm khai báo hải quan bằng AI cho doanh nghiệp xuất nhập khẩu Việt Nam.
Trả về tiêu đề, dòng xem trước (preheader ≤ 120 ký tự) và các khối nội dung theo thứ tự hiển thị.
Quy tắc:
- Khối "heading" cho tiêu đề lớn (tối đa 1-2 khối), "text" cho đoạn văn (có thể dùng **đậm**, *nghiêng*, [chữ](https://…), xuống dòng bằng \\n), "button" cho lời kêu gọi hành động (tối đa 2), "divider"/"spacer" để ngắt đoạn.
- Cá nhân hóa bằng biến: {{name}} (tên người nhận), {{orgName}} (tên doanh nghiệp). Không bịa số liệu, ngày, giá, tên người cụ thể; chỗ cần điền thì để [điền ...].
- Không thêm chữ ký hay lời chào cuối kiểu "Trân trọng, ..." – hệ thống tự gắn chữ ký.
- Trường không dùng thì để chuỗi rỗng; url chỉ cho button.`;

export type EmailDraftInput = { description: string; tone: "FORMAL" | "FRIENDLY" | "SHORT"; language: "vi" | "en" | "zh" };

export class ClaudeEmailDrafter {
  private client: Anthropic;
  constructor(apiKey: string, private model: string, timeoutMs = 60_000) {
    this.client = new Anthropic({ apiKey, timeout: timeoutMs, maxRetries: 1 });
  }

  async draft(input: EmailDraftInput) {
    const res = await this.client.beta.messages.create({
      model: this.model,
      max_tokens: 4000,
      system: SYSTEM,
      output_config: { format: zodOutputFormat(AiOutput) },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages: [{ role: "user", content: `Ngôn ngữ email: ${LANG[input.language]}. Giọng văn: ${TONE[input.tone]}.\nMô tả email cần soạn:\n${input.description}` }],
    });
    const usage = { model: res.model, inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens };
    const text = res.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("");
    let out: z.infer<typeof AiOutput>;
    try {
      out = AiOutput.parse(JSON.parse(text));
    } catch {
      return { subject: "", blocks: [], usage };
    }
    const blocks = out.blocks.map((b) => {
      switch (b.type) {
        case "heading": return { type: "heading", text: b.text, level: 1, align: b.align };
        case "text": return { type: "text", text: b.text, align: b.align };
        case "button": return { type: "button", label: b.text, url: /^https?:\/\//.test(b.url) ? b.url : "https://ct-hq.aixuatnhapkhau.cloud", align: b.align, tone: "primary" };
        case "divider": return { type: "divider" };
        case "spacer": return { type: "spacer", size: "md" };
      }
    });
    return { subject: out.subject, ...(out.preheader ? { preheader: out.preheader } : {}), blocks, usage };
  }
}
