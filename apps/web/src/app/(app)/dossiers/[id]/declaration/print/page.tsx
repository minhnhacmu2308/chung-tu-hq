import { DeclarationPrintPage } from "@/features/declaration-print/declaration-print-page";

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ to?: string }> }) {
  const [{ id }, { to }] = await Promise.all([params, searchParams]);
  // ?to=k: tờ khai nhánh k; thiếu / sai → tờ 1 (trang tự kẹp về số tờ thật).
  const sheet = to && /^[1-9]\d{0,3}$/.test(to) ? Number(to) : 1;
  return <DeclarationPrintPage dossierId={id} sheet={sheet} />;
}
