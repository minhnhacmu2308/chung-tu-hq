import { z } from "zod";
import { DEFAULT_PARTY_CLASS, DirectionSchema, DossierStatusSchema, IsoDateSchema, PartyClassSchema, StepIdSchema, TransportModeSchema } from "../common.js";

export const CreateDossierInputSchema = z.object({
  direction: DirectionSchema,
  typeCode: z.string().trim().toUpperCase().regex(/^[A-Z][0-9]{2}$/, "Mã loại hình dạng A11, E21, B11…"),
  partner: z.string().trim().toUpperCase().min(1, "Nhập đối tác"),
  customsOffice: z.string().trim().min(1, "Chọn cơ quan Hải quan"),
  skillSetId: z.string().min(1),
  dueDate: IsoDateSchema,
  /** Không hỏi khi tạo hồ sơ: tờ khai lấy điều kiện giao hàng đọc từ invoice (bước OCR). Giữ để tương thích – rỗng = chưa biết. */
  incoterm: z.string().trim().toUpperCase().default(""),
  transportMode: TransportModeSchema,
  partyClass: PartyClassSchema.default(DEFAULT_PARTY_CLASS),
  note: z.string().trim().optional(),
});
export type CreateDossierInput = z.infer<typeof CreateDossierInputSchema>;

export const DossierFilterSchema = z.object({ direction: DirectionSchema.optional(), status: DossierStatusSchema.optional(), step: StepIdSchema.optional() });
export type DossierFilter = z.infer<typeof DossierFilterSchema>;

export const UpdateDossierInputSchema = z.object({ note: z.string().trim().optional(), step: StepIdSchema.optional() });
export type UpdateDossierInput = z.infer<typeof UpdateDossierInputSchema>;
