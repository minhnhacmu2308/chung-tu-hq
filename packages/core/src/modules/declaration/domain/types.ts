// Kiểu dùng chung giữa domain và application (domain không import application).
import type { DossierStatus, PartyClass, StepId, TransportMode, ValueSource } from "@kb/contracts";

export type DossierInfo = {
  id: string; code: string; direction: "NK" | "XK"; typeCode: string; partner: string; customsOfficeCode: string; customsOfficeName: string; status: DossierStatus; step: StepId;
  ownerId: string; invoiceValue: string; currency: string; incoterm: string; transportMode: TransportMode; partyClass: PartyClass; billNo: string; declarationNo: string | null; note: string | null;
};
export type OrgInfo = { taxCode: string; name: string; address: string; phone: string; fourEyes: boolean };
/** Giá trị một chỉ tiêu đã dựng: khóa là `code` mnemonic (ổn định cho FE/API), `no` số chỉ tiêu Phụ lục II. */
/** `blocking`: chỉ tiêu bắt buộc có điều kiện mà để trống thì chặn phê duyệt (xem `canApprove`). */
export type StoredField = { no: string; label: string; section: "GENERAL" | "PARTIES" | "TRANSPORT" | "VALUE"; value: string; source: ValueSource; suspect?: boolean; note?: string; blocking?: true };
export type HsCatalogRow = { code: string; description: string; mfn: string; pref: Record<string, string>; vat: string; policy: string | null; keywords: string[] };
