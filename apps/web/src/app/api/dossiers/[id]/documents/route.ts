import { listDocuments, uploadDocuments } from "@kb/core/modules/dossier";
import { readUploadFiles } from "@/lib/server/upload";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

export const dynamic = "force-dynamic";
export const GET = route(async (_req, params) => {
  const { ctx } = await requireSession();
  return fromResult(await listDocuments(getContainer().dossier, ctx, params.id!));
});
/** multipart/form-data, trường `files` (nhiều). */
export const POST = route(async (req, params) => {
  const { ctx } = await requireSession();
  const files = await readUploadFiles(req);
  return fromResult(await uploadDocuments(getContainer().dossier, ctx, params.id!, files));
});
