import { z } from "zod";
import { DecimalStringSchema, IsoDateSchema, IsoDateTimeSchema, RoleSchema } from "../common.js";

export const MemberSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.email(),
  role: RoleSchema,
  status: z.enum(["ACTIVE", "INVITED", "DISABLED"]),
  lastActiveAt: IsoDateTimeSchema.optional(),
});
export type Member = z.infer<typeof MemberSchema>;

/** TRIAL: gói dùng thử khi tạo doanh nghiệp mới (ADR 0004). */
export const PlanCodeSchema = z.enum(["TRIAL", "BASIC", "PRO", "ENTERPRISE"]);
export type PlanCode = z.infer<typeof PlanCodeSchema>;

export const OrganizationSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** MST – string. */
  taxCode: z.string(),
  address: z.string(),
  phone: z.string(),
  plan: z.object({
    code: PlanCodeSchema,
    name: z.string(),
    dossiersPerMonth: z.number().int().nonnegative(),
    pagesPerDossier: z.number().int().nonnegative(),
    renewsAt: IsoDateSchema,
  }),
  usage: z.object({ dossiersThisMonth: z.number().int().nonnegative(), pagesThisMonth: z.number().int().nonnegative(), aiCostVnd: DecimalStringSchema }),
  suspectThreshold: z.enum(["STRICT", "BALANCED", "RELAXED"]),
});
export type Organization = z.infer<typeof OrganizationSchema>;

export const IntegrationIdSchema = z.enum(["HSCODEPRO", "CUSTOMS_HUB", "AI_PROVIDER", "EINVOICE"]);
export type IntegrationId = z.infer<typeof IntegrationIdSchema>;
export const IntegrationSchema = z.object({
  id: IntegrationIdSchema,
  name: z.string(),
  description: z.string(),
  status: z.enum(["CONNECTED", "ERROR", "NOT_CONFIGURED"]),
  lastCheckedAt: IsoDateTimeSchema.optional(),
  detail: z.string().optional(),
});
export type Integration = z.infer<typeof IntegrationSchema>;
