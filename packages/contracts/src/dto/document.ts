import { z } from "zod";
import { DocKindSchema, DocumentStatusSchema, IsoDateTimeSchema } from "../common.js";

export const DossierDocumentSchema = z.object({
  id: z.string(),
  dossierId: z.string(),
  kind: DocKindSchema,
  fileName: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  pages: z.number().int().nonnegative(),
  status: DocumentStatusSchema,
  error: z.string().optional(),
  uploadedAt: IsoDateTimeSchema,
});
export type DossierDocument = z.infer<typeof DossierDocumentSchema>;
