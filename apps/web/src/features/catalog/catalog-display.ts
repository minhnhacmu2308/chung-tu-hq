// Hằng số hiển thị dùng chung trong danh mục: loại mặt hàng, trạng thái mặt hàng / mã (StatusBadge).
import type { AliasStatus, CatalogItemKind, ItemMatchLevel, ItemStatus } from "@kb/contracts";
import type { Status } from "@kb/ui";

export const ITEM_KINDS: readonly CatalogItemKind[] = ["MATERIAL", "PRODUCT", "GOODS", "SUPPLY"];
export const ITEM_STATUS = { ACTIVE: "CATALOG_ITEM_ACTIVE", MERGED: "CATALOG_ITEM_MERGED", ARCHIVED: "CATALOG_ITEM_ARCHIVED" } as const satisfies Record<ItemStatus, Status>;
export const MATCH_LEVEL = { SURE: "CATALOG_MATCH_SURE", MAYBE: "CATALOG_MATCH_MAYBE", NONE: "CATALOG_MATCH_NONE" } as const satisfies Record<ItemMatchLevel, Status>;
export const ALIAS_STATUS = { PROPOSED: "CATALOG_ALIAS_PROPOSED", ACTIVE: "CATALOG_ALIAS_ACTIVE", REJECTED: "CATALOG_ALIAS_REJECTED" } as const satisfies Record<AliasStatus, Status>;
