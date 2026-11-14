// Danh mục hàng hóa dùng chung (ADR 0015): mặt hàng, bộ mã, bí danh, quy đổi, hàng chờ ghép, nhập Excel, đối chiếu, tra mã
// + gắn mặt hàng cho dòng hàng. Chọn mock|http theo NEXT_PUBLIC_DATA_SOURCE.
import { pick } from "@/lib/data-source";
import * as mock from "@/mocks/api/catalog";
import * as http from "./http/catalog";

export const catalogKeys = mock.catalogKeys;
export type {
  AliasActionInput, CatalogImport, CatalogItem, CatalogItemDetail, CatalogItemHistoryEntry, CatalogItemListRow, CatalogItemPage, CatalogMode, CatalogSettingsView, CodeSet, CodeSetKind,
  CreateItemRequest, CreateItemResult, CrossReference, DecideQueueInput, ItemAlias, ListCatalogItemsQueryInput, ListQueueQueryInput, MatchQueueItem, MatchQueuePage,
  ResolveItemResultDto, ResolveManyResult, ResolveManyRow, SourceChangeBlockedItem, SourceChangePreview, SourceChangeResult, UnitConversion,
} from "@kb/contracts";

export const getCatalogSettings = pick(mock.getCatalogSettings, http.getCatalogSettings);
export const setupCatalog = pick(mock.setupCatalog, http.setupCatalog);
export const changeCatalogMode = pick(mock.changeCatalogMode, http.changeCatalogMode);

export const listCodeSets = pick(mock.listCodeSets, http.listCodeSets);
export const saveCodeSet = pick(mock.saveCodeSet, http.saveCodeSet);
export const setPrimaryDisplay = pick(mock.setPrimaryDisplay, http.setPrimaryDisplay);
export const previewSourceChange = pick(mock.previewSourceChange, http.previewSourceChange);
export const changeSourceSet = pick(mock.changeSourceSet, http.changeSourceSet);

export const listCatalogItems = pick(mock.listCatalogItems, http.listCatalogItems);
export const getCatalogItem = pick(mock.getCatalogItem, http.getCatalogItem);
export const getCatalogItemHistory = pick(mock.getCatalogItemHistory, http.getCatalogItemHistory);
export const createCatalogItem = pick(mock.createCatalogItem, http.createCatalogItem);
export const updateCatalogItem = pick(mock.updateCatalogItem, http.updateCatalogItem);
export const archiveCatalogItem = pick(mock.archiveCatalogItem, http.archiveCatalogItem);
export const mergeCatalogItems = pick(mock.mergeCatalogItems, http.mergeCatalogItems);
export const splitCatalogAliases = pick(mock.splitCatalogAliases, http.splitCatalogAliases);

export const proposeAlias = pick(mock.proposeAlias, http.proposeAlias);
export const aliasAction = pick(mock.aliasAction, http.aliasAction);
export const deactivateAlias = pick(mock.deactivateAlias, http.deactivateAlias);

export const setConversion = pick(mock.setConversion, http.setConversion);
export const removeConversion = pick(mock.removeConversion, http.removeConversion);

export const listMatchQueue = pick(mock.listMatchQueue, http.listMatchQueue);
export const decideQueueItem = pick(mock.decideQueueItem, http.decideQueueItem);
export const decideQueueBulk = pick(mock.decideQueueBulk, http.decideQueueBulk);

export const importCatalogRows = pick(mock.importCatalogRows, http.importCatalogRows);
export const listCatalogImports = pick(mock.listCatalogImports, http.listCatalogImports);
export const getCatalogImport = pick(mock.getCatalogImport, http.getCatalogImport);
export const importCatalogFromDocuments = pick(mock.importCatalogFromDocuments, http.importCatalogFromDocuments);

export const exportCrossReference = pick(mock.exportCrossReference, http.exportCrossReference);
export const resolveCatalogItem = pick(mock.resolveCatalogItem, http.resolveCatalogItem);
export const resolveCatalogMany = pick(mock.resolveCatalogMany, http.resolveCatalogMany);

export const linkLineItem = pick(mock.linkLineItem, http.linkLineItem);
export const setLineUnitFactor = pick(mock.setLineUnitFactor, http.setLineUnitFactor);
