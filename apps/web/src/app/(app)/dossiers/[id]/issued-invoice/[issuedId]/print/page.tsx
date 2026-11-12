import { InvoicePrintPage } from "@/features/invoice-print/invoice-print-page";

export default async function Page({ params, searchParams }: { params: Promise<{ id: string; issuedId: string }>; searchParams: Promise<{ doc?: string }> }) {
  const [{ id, issuedId }, { doc }] = await Promise.all([params, searchParams]);
  return <InvoicePrintPage dossierId={id} issuedId={issuedId} doc={doc === "packing" ? "packing" : "invoice"} />;
}
