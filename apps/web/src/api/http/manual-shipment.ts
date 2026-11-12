import { ManualShipmentViewSchema, type ManualShipmentInput } from "@kb/contracts";
import { apiGet, apiPut } from "@/lib/http";

export const getManualShipment = (dossierId: string) => apiGet(`dossiers/${dossierId}/manual-shipment`, ManualShipmentViewSchema);
export const saveManualShipment = (dossierId: string, input: ManualShipmentInput) => apiPut(`dossiers/${dossierId}/manual-shipment`, input, ManualShipmentViewSchema);
