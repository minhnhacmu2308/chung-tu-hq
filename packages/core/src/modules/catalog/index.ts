// Danh mục hàng hóa dùng chung (ADR 0015): mặt hàng chuẩn có mã nối, bộ mã + người phụ trách, bí danh, quy đổi đơn vị, gộp/tách, tra mã.
// Public API: use case, kiểu công khai, CatalogPort cho module khác. Không export repo/adapter.
export type { CatalogAuditWriter, CatalogDeps, CatalogHistoryRow, CatalogDocumentLine, CatalogDocumentSource, CatalogMembers } from "./application/ports.js";
export { formatItemNo } from "./domain/item-no.js";
export { archiveItem, createItem, getItem, getItemHistory, ITEM_HISTORY_LIMIT, listItems, updateItem, type CreateItemResult } from "./application/items.js";
export { changeMode, getCatalogSettings, listCodeSets, setOwners, setPrimaryDisplay, setupCatalog, upsertCodeSet, type CatalogSettingsView, type UpsertCodeSetCommand } from "./application/code-sets.js";
export { decideAlias, deactivateAlias, moveAlias, proposeAlias, proposeLessonAlias, type LessonAliasInput, type LessonAliasResult, type ProposeAliasCommand } from "./application/aliases.js";
export { removeConversion, setConversion } from "./application/conversions.js";
export { mergeItems, splitAliases, type SplitNewItem } from "./application/merge.js";
export { resolveItem, resolveMany, resolveManyWithItems, type ResolveItemQuery, type ResolveItemResult } from "./application/resolve.js";
export { exportCrossReference } from "./application/export.js";
export { createCatalogLinks, type CatalogLinks } from "./application/links.js";
export { createCatalogPort, type CatalogItemBrief, type CatalogPort, type CodeInSet, type DeclaredRow, type UnknownCodeRow } from "./application/catalog-port.js";
export { getImport, importRows, listImports } from "./application/import.js";
export { failImport, MATCH_CHUNK_ROWS, runMatch } from "./application/match-run.js";
export { decideQueue, decideQueueBulk, listQueue } from "./application/queue.js";
export { importFromDocuments } from "./application/from-documents.js";
