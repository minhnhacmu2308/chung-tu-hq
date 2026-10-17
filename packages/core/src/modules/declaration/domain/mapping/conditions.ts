// Điều kiện xuất hiện của chỉ tiêu "theo tình huống" cho FieldMapping.when. Luật nằm ở @kb/contracts (DECLARATION_CONDITIONS) –
// dùng chung với bố cục tờ khai trên giao diện; ở đây chỉ dựng ConditionContext từ dữ liệu lô hàng.
import { DECLARATION_CONDITIONS, type ConditionContext, type ConditionId } from "@kb/contracts";
import { incotermCode } from "../adjustments.js";
import { transportModeCode } from "../catalog-resolve.js";
import type { FieldMapping, MappingInput } from "./types.js";

type When = NonNullable<FieldMapping["when"]>;
/** Mã phương thức vận chuyển chỉ tiêu 1.6/2.6 (1 không, 2 biển container, 3 biển rời, 4 bộ, 5 sắt, 6 sông, 9 khác). */
export const transportCode = (i: MappingInput) => transportModeCode(i.dossier.transportMode, i.shipment.transport.containers.length > 0).code;

export const conditionContext = (i: MappingInput): ConditionContext => ({
  typeCode: i.dossier.typeCode,
  transportCode: transportCode(i),
  incoterm: incotermCode(i.shipment.invoice.incoterm.value),
  hasInvoice: i.shipment.documents.some((d) => d.kind === "INVOICE"),
});

const when = (id: ConditionId): When => ({ label: DECLARATION_CONDITIONS[id].label, test: (i) => DECLARATION_CONDITIONS[id].test(conditionContext(i)) });

export const TEMP_IMPORT = when("TEMP_IMPORT");
export const RE_IMPORT = when("RE_IMPORT");
export const RE_EXPORT = when("RE_EXPORT");
export const TEMP_EXPORT = when("TEMP_EXPORT");
export const BY_WATER = when("BY_WATER");
export const IN_CONTAINER = when("IN_CONTAINER");
export const EXPORT_VALUE = when("EXPORT_VALUE");
