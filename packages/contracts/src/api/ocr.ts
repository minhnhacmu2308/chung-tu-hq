import { z } from "zod";
import { DocKindSchema } from "../common.js";

export const ChangeDocumentKindInputSchema = z.object({ kind: DocKindSchema });
export const UpdateFieldValueInputSchema = z.object({ value: z.string().trim().max(2000) });
export const FileUrlSchema = z.object({ url: z.string(), expiresAt: z.string() });
export type FileUrl = z.infer<typeof FileUrlSchema>;
