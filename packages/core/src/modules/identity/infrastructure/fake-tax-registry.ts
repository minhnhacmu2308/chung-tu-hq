import type { TaxRegistryLookup } from "../application/ports.js";

/** Chưa có API tra cứu MST thật (BACKEND-TODO T3): MST đuôi "000" → không tìm thấy; còn lại trả tên giả. */
export class FakeTaxRegistryLookup implements TaxRegistryLookup {
  async lookup(taxCode: string) {
    if (taxCode.endsWith("000")) return { found: false as const };
    return { found: true as const, name: `CÔNG TY TNHH MST ${taxCode}`, address: "Địa chỉ theo đăng ký thuế (dữ liệu giả – chưa nối cơ quan thuế)" };
  }
}
