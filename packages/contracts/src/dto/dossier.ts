import { z } from "zod";
import { CustomsChannelSchema, DecimalStringSchema, DirectionSchema, DossierStatusSchema, IsoDateSchema, IsoDateTimeSchema, PartyClassSchema, StepIdSchema, TransportModeSchema } from "../common.js";

/** Trạng thái Hải quan gộp từ các tờ khai nhánh ("Thông quan k/N", cảnh báo tờ bị từ chối / lỗi gửi) – dossierCustomsSummary. */
export const CustomsProblemSchema = z.object({ no: z.number().int().min(1), kind: z.enum(["REJECTED", "SEND_FAILED"]) });
export const CustomsSummarySchema = z.object({ cleared: z.number().int().nonnegative(), of: z.number().int().min(1), problems: z.array(CustomsProblemSchema) });
export type CustomsSummary = z.infer<typeof CustomsSummarySchema>;

export const DossierSchema = z.object({
  id: z.string(),
  code: z.string(),
  direction: DirectionSchema,
  typeCode: z.string(),
  partner: z.string(),
  customsOffice: z.string(),
  skillSetId: z.string(),
  status: DossierStatusSchema,
  step: StepIdSchema,
  dueDate: IsoDateSchema,
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
  ownerId: z.string(),
  invoiceValue: DecimalStringSchema,
  currency: z.string(),
  incoterm: z.string(),
  transportMode: TransportModeSchema,
  partyClass: PartyClassSchema,
  billNo: z.string(),
  suspectFields: z.number().int().nonnegative(),
  note: z.string().optional(),
  declarationNo: z.string().optional(),
  channel: CustomsChannelSchema.optional(),
  /** Trạng thái Hải quan gộp từ các tờ khai nhánh ("Thông quan k/N"); vắng khi chưa truyền. */
  customs: CustomsSummarySchema.optional(),
});
export type Dossier = z.infer<typeof DossierSchema>;
