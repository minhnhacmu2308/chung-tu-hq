import { setStaffDisabled } from "@kb/core/modules/admin";
import { AdminReasonInputSchema } from "@kb/contracts";
import { z } from "zod";
import { requireStaff } from "@/lib/server/admin-auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

const Input = AdminReasonInputSchema.extend({ disabled: z.boolean() });
export const POST = route(async (req, p) => {
  const { disabled, reason } = await parseBody(req, Input);
  return fromResult(await setStaffDisabled(getContainer().admin, await requireStaff(), p.id!, disabled, { reason }));
});
