import type { Metadata } from "next";
import { ExchangeRatesPage } from "@/features/admin/exchange-rates/exchange-rates-page";

export const metadata: Metadata = { title: "Tỷ giá tính thuế" };

export default function Page() {
  return <ExchangeRatesPage />;
}
