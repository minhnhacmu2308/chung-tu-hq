import { notFound } from "next/navigation";
import { KvgsPrintPage } from "@/features/kvgs-print/kvgs-print-page";

export default async function Page({ params, searchParams }: { params: Promise<{ id: string; branch: string }>; searchParams: Promise<{ mau?: string }> }) {
  const [{ id, branch }, { mau }] = await Promise.all([params, searchParams]);
  const no = Number(branch);
  if (!/^[1-9]\d*$/.test(branch) || !Number.isSafeInteger(no)) notFound();
  return <KvgsPrintPage dossierId={id} branch={no} template={mau === "cont" || mau === "le" ? mau : null} />;
}
