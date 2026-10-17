// DeclarationSectionSchema/DeclarationSection trùng tên với dto/declaration.ts (enum 4 nhóm cho màn hình tờ khai),
// nên ở cấp package export dưới tên Catalog*. Import trực tiếp "./catalog-types.js" để dùng tên gốc.
export {
  DeclarationSectionSchema as CatalogSectionSchema,
  type DeclarationSection as CatalogSection,
  CodeTableSchema,
  type CodeTable,
  DeclarationFieldDefSchema,
  type DeclarationFieldDef,
} from "./catalog-types.js";
export { CATALOG_IDA } from "./catalog-ida.js";
export { CATALOG_IDA_ITEMS } from "./catalog-ida-items.js";
export { CATALOG_EDA } from "./catalog-eda.js";
export { catalogFieldRole, declarationFieldRole, findDeclarationFieldDef, type DeclarationFieldRole } from "./field-role.js";
export * from "./code-tables.js";
