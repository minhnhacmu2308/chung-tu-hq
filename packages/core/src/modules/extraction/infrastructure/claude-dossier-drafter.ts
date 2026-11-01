// "Nhờ AI điền" form Tạo hồ sơ (ADR 0010). Ở extraction/infrastructure vì mọi lời gọi SDK AI gom một chỗ (depcruise ai-sdk-only-in-extraction-infra);
// module dossier nhận qua port DossierDraftAi do container nối. Việc chỉ là hiểu một câu yêu cầu → dùng model rẻ nhất (AI_FAST_MODEL), không suy luận dài.
// Prompt chỉ có câu người dùng gõ + tóm tắt hồ sơ gần đây của CHÍNH doanh nghiệp đó. Đầu ra là ô thô – use case kiểm danh mục rồi mới trả về.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { AiDossierDraft, DossierBrief, DossierDraftAi } from "../../dossier/index.js";

const AiOutput = z.object({
  baseDossierCode: z.string().nullable(),
  direction: z.enum(["NK", "XK"]).nullable(),
  transportMode: z.enum(["AIR", "SEA_CONTAINER", "SEA_BULK", "ROAD", "RAIL", "RIVER", "OTHER"]).nullable(),
  typeCode: z.string().nullable(),
  customsOffice: z.string().nullable(),
  partner: z.string().nullable(),
  dueInDays: z.number().int().nullable(),
  note: z.string().nullable(),
});

const SYSTEM = `Bạn điền form "Tạo hồ sơ khai báo hải quan" từ một câu yêu cầu của người khai (Việt Nam). Chỉ trả về các ô, không giải thích.
- baseDossierCode: mã hồ sơ cũ (dạng HS-NK-2610-142) khi người dùng muốn "giống/như/copy/lặp lại" một hồ sơ – chọn trong danh sách hồ sơ gần đây, kể cả khi họ chỉ tả bằng đối tác, tuyến hay "lô trước". Không nhắc tới → null.
- direction: NK (nhập khẩu) | XK (xuất khẩu).
- transportMode: AIR (hàng không) | SEA_CONTAINER (biển, container) | SEA_BULK (biển, hàng rời) | ROAD (đường bộ) | RAIL (đường sắt) | RIVER (đường sông) | OTHER.
- typeCode: mã loại hình VNACCS 3 ký tự (A11, A12, A31, A41, E21, E31, B11, B13, E52, G11…) khi người dùng nói hoặc mô tả rõ (nhập kinh doanh → A11, nhập gia công → E21, nhập sản xuất xuất khẩu → E31, xuất kinh doanh → B11…).
- customsOffice: mã chi cục (4 ký tự) hoặc tên chi cục/cửa khẩu như người dùng viết (vd "Cát Lái", "Nội Bài").
- partner: tên đối tác nước ngoài (người bán khi nhập, người mua khi xuất) đúng như người dùng viết.
- dueInDays: số ngày từ hôm nay tới hạn xử lý khi người dùng nói ("mai" = 1, "tuần sau" = 7).
- note: ghi chú cho hồ sơ khi người dùng muốn ghi thêm gì đó.
Ô nào người dùng không nói (và không lấy từ hồ sơ cũ) → null. Không bịa.`;

const line = (d: DossierBrief) => `${d.code} | ${d.direction} | ${d.transportMode} | ${d.typeCode} | ${d.customsOffice} | ${d.partner} | ${d.createdOn}`;

export class ClaudeDossierDrafter implements DossierDraftAi {
  private client: Anthropic;
  constructor(apiKey: string, private model: string, timeoutMs = 30_000) {
    this.client = new Anthropic({ apiKey, timeout: timeoutMs, maxRetries: 1 });
  }

  async draft(input: { prompt: string; today: string; recent: DossierBrief[] }) {
    const recent = input.recent.length ? input.recent.map(line).join("\n") : "(chưa có)";
    const res = await this.client.beta.messages.create({
      model: this.model,
      max_tokens: 600,
      system: SYSTEM,
      output_config: { format: zodOutputFormat(AiOutput) },
      messages: [{ role: "user", content: `Hôm nay: ${input.today}\nHồ sơ gần đây (mã | chiều | vận tải | loại hình | chi cục | đối tác | ngày tạo):\n${recent}\n\nYêu cầu:\n${input.prompt}` }],
    });
    const usage = { model: res.model, inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens };
    const text = res.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("");
    return { result: parseOutput(text), usage };
  }
}

/** JSON của model → gợi ý; hỏng (từ chối, bị cắt) → null để use case vẫn ghi usage rồi báo lỗi. */
function parseOutput(text: string): AiDossierDraft | null {
  try {
    const r = AiOutput.safeParse(JSON.parse(text));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}
