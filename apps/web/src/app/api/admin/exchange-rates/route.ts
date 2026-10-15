import { listExchangeRates, upsertExchangeRate } from "@kb/core/modules/admin";
import { UpsertExchangeRateInputSchema } from "@kb/contracts";
import { getContainer } from "@/container";
import { requireStaff } from "@/lib/server/admin-auth";
import { fromResult, parseBody, route } from "@/lib/server/route";

export const dynamic = "force-dynamic";
/** Tỷ giá tính thuế theo tuần (khu Quản trị): xem (VIEW) / thêm-sửa tay (PLATFORM, kèm lý do). */
export const GET = route(async () => fromResult(await listExchangeRates(getContainer().admin, await requireStaff())));
export const PUT = route(async (req) => fromResult(await upsertExchangeRate(getContainer().admin, await requireStaff(), await parseBody(req, UpsertExchangeRateInputSchema))));
