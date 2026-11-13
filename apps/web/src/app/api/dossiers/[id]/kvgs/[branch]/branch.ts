import { z } from "zod";

/** `[branch]` trên đường dẫn: số nguyên dương (tờ khai nhánh); sai → ZodError → 400 VALIDATION. */
export const BranchParamSchema = z.coerce.number().int().positive();
export const branchOf = (params: Record<string, string | undefined>): number => BranchParamSchema.parse(params.branch);
