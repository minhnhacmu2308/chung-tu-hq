// Khối dùng chung cho schema trích xuất. Quy ước: mọi trường required + nullable (structured output ổn định);
// số là number đã quy đổi theo locale chứng từ (model chép số, không tính); mã định danh là string; ngày YYYY-MM-DD.
import { z } from "zod";

export const nStr = (desc: string) => z.string().nullable().describe(desc);
export const nNum = (desc: string) => z.number().nullable().describe(desc);
export const nDate = (desc: string) => z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().describe(`${desc} – định dạng YYYY-MM-DD`);

export const PartySchema = z.object({
  name: nStr("Tên công ty như in trên chứng từ"),
  address: nStr("Địa chỉ đầy đủ"),
  taxCode: nStr("Mã số thuế / Tax ID / VAT no (giữ nguyên chuỗi, không bỏ số 0 đầu)"),
  country: nStr("Mã nước ISO 3166-1 alpha-2 (VN, KR, CN…); suy từ địa chỉ nếu không in rõ"),
});
export type Party = z.infer<typeof PartySchema>;

export const UncertaintiesSchema = z.array(z.string()).describe("Tên các trường model không chắc (chữ mờ, nhiều giá trị, suy đoán). Rỗng nếu chắc chắn.");

/** Vị trí trên trang do model trả về (nếu hỗ trợ), % trang. */
export const RegionHintSchema = z.object({ page: z.number().int().positive(), x: z.number(), y: z.number(), w: z.number(), h: z.number() });
