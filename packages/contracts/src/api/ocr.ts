import { z } from "zod";
import { DocKindSchema } from "../common.js";

export const ChangeDocumentKindInputSchema = z.object({ kind: DocKindSchema });
export const UpdateFieldValueInputSchema = z.object({ value: z.string().trim().max(2000) });
/** Sửa nhiều trường cùng hồ sơ một lần (áp xuất xứ cho các dòng đã chọn…): server ghi trong 1 transaction. */
export const UpdateFieldValuesInputSchema = z.object({ edits: z.array(z.object({ id: z.string().min(1).max(64), value: z.string().trim().max(2000) })).min(1).max(500) });
export const FileUrlSchema = z.object({ url: z.string(), expiresAt: z.string() });
export type FileUrl = z.infer<typeof FileUrlSchema>;
