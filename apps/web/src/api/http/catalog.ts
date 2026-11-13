// Danh mục hàng hóa dùng chung (ADR 0015) qua route /api/org/catalog/** + gắn mặt hàng cho dòng hàng (/api/line-items/:id/*).
import {
  CatalogImportSchema, CatalogItemDetailSchema, CatalogItemHistoryEntrySchema, CatalogItemPageSchema, CatalogSettingsViewSchema, CodeSetSchema, CreateItemResultSchema, CrossReferenceSchema,
  DecideQueueBulkResultSchema, ItemAliasSchema, LineItemSchema, MatchQueueItemSchema, MatchQueuePageSchema, ResolveItemResultSchema, ResolveManyResultSchema, UnitConversionSchema,
  type AliasActionInput, type ChangeCatalogModeInput, type CreateItemRequest, type DecideQueueBulkInput, type DecideQueueInput, type ImportFromDocumentsInput,
  type ImportRowsInput, type LinkLineItemInput, type ListCatalogItemsQueryInput, type ListQueueQueryInput, type ProposeAliasInput, type ResolveItemQueryInput, type ResolveManyRow,
  type SetConversionInput, type SetupCatalogRequest, type SplitAliasesInput, type UpdateItemRequest, type UpsertCodeSetInput,
} from "@kb/contracts";
import { z } from "zod";
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "@/lib/http";

/** Đối tượng → query string (bỏ giá trị rỗng/undefined). */
function qs(params: object): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (typeof v === "string" ? v !== "" : typeof v === "number" || typeof v === "boolean") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}

const C = "org/catalog";

export const getCatalogSettings = () => apiGet(`${C}/setup`, CatalogSettingsViewSchema);
export const setupCatalog = (input: SetupCatalogRequest) => apiPost(`${C}/setup`, input, z.array(CodeSetSchema));
export const changeCatalogMode = (input: ChangeCatalogModeInput) => apiPut(`${C}/setup`, input, z.array(CodeSetSchema));

export const listCodeSets = () => apiGet(`${C}/code-sets`, z.array(CodeSetSchema));
export const saveCodeSet = (id: string | null, input: UpsertCodeSetInput) =>
  id ? apiPut(`${C}/code-sets/${id}`, input, CodeSetSchema) : apiPost(`${C}/code-sets`, input, CodeSetSchema);
export const setPrimaryDisplay = (codeSetId: string | null) => apiPut(`${C}/code-sets/primary-display`, { codeSetId }, z.array(CodeSetSchema));

export const listCatalogItems = (query: ListCatalogItemsQueryInput = {}) => apiGet(`${C}/items${qs(query)}`, CatalogItemPageSchema);
export const getCatalogItem = (id: string) => apiGet(`${C}/items/${id}`, CatalogItemDetailSchema);
export const getCatalogItemHistory = (id: string) => apiGet(`${C}/items/${id}/history`, z.array(CatalogItemHistoryEntrySchema));
export const createCatalogItem = (input: CreateItemRequest) => apiPost(`${C}/items`, input, CreateItemResultSchema);
export const updateCatalogItem = (id: string, input: UpdateItemRequest) => apiPatch(`${C}/items/${id}`, input, CatalogItemDetailSchema);
export const archiveCatalogItem = (id: string, archived: boolean) => apiPut(`${C}/items/${id}`, { archived }, CatalogItemDetailSchema);
export const mergeCatalogItems = (fromId: string, intoId: string) => apiPost(`${C}/items/${fromId}/merge`, { intoId }, CatalogItemDetailSchema);
export const splitCatalogAliases = (input: SplitAliasesInput) => apiPost(`${C}/items/split`, input, CatalogItemDetailSchema);

export const proposeAlias = (input: ProposeAliasInput) => apiPost(`${C}/aliases`, input, ItemAliasSchema);
export const aliasAction = (id: string, input: AliasActionInput) => apiPatch(`${C}/aliases/${id}`, input, ItemAliasSchema);
export const deactivateAlias = (id: string) => apiDelete(`${C}/aliases/${id}`, ItemAliasSchema);

export const setConversion = (input: SetConversionInput) => apiPut(`${C}/conversions`, input, z.array(UnitConversionSchema));
export const removeConversion = (itemId: string, unit: string) => apiDelete(`${C}/conversions${qs({ itemId, unit })}`, z.array(UnitConversionSchema));

export const listMatchQueue = (query: ListQueueQueryInput = {}) => apiGet(`${C}/queue${qs(query)}`, MatchQueuePageSchema);
export const decideQueueItem = (id: string, input: DecideQueueInput) => apiPost(`${C}/queue/${id}`, input, MatchQueueItemSchema);
export const decideQueueBulk = (input: DecideQueueBulkInput) => apiPost(`${C}/queue/bulk`, input, DecideQueueBulkResultSchema);

export const importCatalogRows = (input: ImportRowsInput) => apiPost(`${C}/imports`, input, CatalogImportSchema);
export const listCatalogImports = () => apiGet(`${C}/imports`, z.array(CatalogImportSchema));
export const getCatalogImport = (id: string) => apiGet(`${C}/imports/${id}`, CatalogImportSchema);
export const importCatalogFromDocuments = (input: ImportFromDocumentsInput) => apiPost(`${C}/imports/from-documents`, input, z.array(CatalogImportSchema));

export const exportCrossReference = () => apiGet(`${C}/export/cross-reference`, CrossReferenceSchema);
export const resolveCatalogItem = (query: ResolveItemQueryInput) => apiGet(`${C}/resolve${qs(query)}`, ResolveItemResultSchema);
export const resolveCatalogMany = (rows: ResolveManyRow[]) => apiPost(`${C}/resolve-many`, { rows }, z.array(ResolveManyResultSchema));

export const linkLineItem = (lineItemId: string, input: LinkLineItemInput) => apiPost(`line-items/${lineItemId}/catalog`, input, LineItemSchema);
export const setLineUnitFactor = (lineItemId: string, factor: string | null) => apiPut(`line-items/${lineItemId}/unit-factor`, { factor }, LineItemSchema);
