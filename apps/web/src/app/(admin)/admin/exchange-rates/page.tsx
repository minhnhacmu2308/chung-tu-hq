import type { Metadata } from "next";
import { ADMIN_TITLES } from "@/app/(admin)/admin-titles.messages";
import { ExchangeRatesPage } from "@/features/admin/exchange-rates/exchange-rates-page";

export const metadata: Metadata = { title: ADMIN_TITLES.exchangeRates };

export default function Page() {
  return <ExchangeRatesPage />;
}
