import { z } from "zod";
import { DEFAULT_PARTY_CLASS, DirectionSchema, DocumentSourcesSchema, DossierStatusSchema, IsoDateSchema, PartyClassSchema, StartModeSchema, StepIdSchema, TransportModeSchema } from "../common.js";

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
  /** Hồ sơ xuất (ADR 0013): "khai trước" → Invoice + Packing List do hệ thống phát hành. Hồ sơ nhập bỏ qua. */
  startMode: StartModeSchema.optional(),
});
export type CreateDossierInput = z.infer<typeof CreateDossierInputSchema>;

export const DossierFilterSchema = z.object({
  direction: DirectionSchema.optional(),
  status: DossierStatusSchema.optional(),
  step: StepIdSchema.optional(),
  /** Tìm theo mã hồ sơ / đối tác / số vận đơn (không phân biệt hoa thường). */
  q: z.string().trim().min(1).max(100).optional(),
});
export type DossierFilter = z.infer<typeof DossierFilterSchema>;

export const UpdateDossierInputSchema = z.object({
  note: z.string().trim().optional(),
  step: StepIdSchema.optional(),
  /** Đổi nguồn chứng từ (ADR 0013): gộp vào nguồn hiện có; `UPLOADED` = bỏ đánh dấu "có sau khi khai". */
  documentSources: DocumentSourcesSchema.optional(),
  /** Gộp / tách dòng hàng giống nhau (bước OCR) – đổi thì dựng lại shipment, dòng hàng và tờ khai nháp. */
  mergeIdenticalLines: z.boolean().optional(),
});
export type UpdateDossierInput = z.infer<typeof UpdateDossierInputSchema>;

/** Kết quả xóa hẳn hồ sơ (chỉ hồ sơ chưa truyền Hải quan). */
export const DeleteDossierResultSchema = z.object({ id: z.string(), code: z.string() });
export type DeleteDossierResult = z.infer<typeof DeleteDossierResultSchema>;

/** "Nhờ AI điền" ở màn Tạo hồ sơ (ADR 0010): người dùng gõ yêu cầu, vd "giống hồ sơ HS-NK-2610-142 nhưng đi máy bay". */
export const DraftDossierInputSchema = z.object({ prompt: z.string().trim().min(3, "Nhập yêu cầu").max(1000) });
export type DraftDossierInput = z.infer<typeof DraftDossierInputSchema>;

/**
 * Giá trị gợi ý cho form Tạo hồ sơ – KHÔNG tạo hồ sơ; người dùng xem, sửa rồi bấm Tạo.
 * Chỉ có ô AI/hồ sơ gốc xác định được; mã đã kiểm với danh mục VNACCS (TYPE_CODE theo chiều, A038 đang dùng).
 */
export const DossierDraftSchema = z.object({
  direction: DirectionSchema.optional(),
  transportMode: TransportModeSchema.optional(),
  typeCode: z.string().optional(),
  /** Mã chi cục A038 (form dùng mã). */
  customsOfficeCode: z.string().optional(),
  partner: z.string().optional(),
  dueDate: IsoDateSchema.optional(),
  skillSetId: z.string().optional(),
  note: z.string().optional(),
  /** Hồ sơ cũ yêu cầu nhắc tới – các ô không được nói khác lấy theo hồ sơ này. */
  fromDossier: z.object({ id: z.string(), code: z.string() }).optional(),
});
export type DossierDraft = z.infer<typeof DossierDraftSchema>;
