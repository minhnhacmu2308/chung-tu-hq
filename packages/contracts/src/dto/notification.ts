import { z } from "zod";
import { IsoDateTimeSchema } from "../common.js";

export const NotificationSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  at: IsoDateTimeSchema,
  read: z.boolean(),
  href: z.string().optional(),
});
export type Notification = z.infer<typeof NotificationSchema>;
