import { z } from "zod";
import { CustomsChannelSchema, DecimalStringSchema, DirectionSchema, DossierStatusSchema, IsoDateSchema, IsoDateTimeSchema, StepIdSchema, TransportModeSchema } from "../common.js";

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
  billNo: z.string(),
  suspectFields: z.number().int().nonnegative(),
  note: z.string().optional(),
  declarationNo: z.string().optional(),
  channel: CustomsChannelSchema.optional(),
});
export type Dossier = z.infer<typeof DossierSchema>;
