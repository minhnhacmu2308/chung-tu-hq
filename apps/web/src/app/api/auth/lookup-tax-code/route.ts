import { lookupTaxCode } from "@kb/core/modules/identity";
import { getContainer } from "@/container";
import { fromResult, route } from "@/lib/server/route";

export const dynamic = "force-dynamic";
export const GET = route(async (req) => fromResult(await lookupTaxCode(getContainer().identity, req.nextUrl.searchParams.get("taxCode") ?? "")));
