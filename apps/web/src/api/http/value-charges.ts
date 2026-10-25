import { ValueChargesViewSchema, type ValueCharges } from "@kb/contracts";
import { apiGet, apiPut } from "@/lib/http";

export const getValueCharges = (dossierId: string) => apiGet(`dossiers/${dossierId}/value-charges`, ValueChargesViewSchema);
export const saveValueCharges = (dossierId: string, input: ValueCharges) => apiPut(`dossiers/${dossierId}/value-charges`, input, ValueChargesViewSchema);
