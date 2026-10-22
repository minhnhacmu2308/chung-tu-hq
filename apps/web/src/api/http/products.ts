import { ImportProductCatalogResultSchema, ProductCatalogItemSchema, type ImportProductCatalogInput, type ProductCatalogInput } from "@kb/contracts";
import { z } from "zod";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/http";

const DeletedSchema = z.object({ deleted: z.number().int() });

export const listProducts = () => apiGet("org/products", z.array(ProductCatalogItemSchema));
export const createProduct = (input: ProductCatalogInput) => apiPost("org/products", input, ProductCatalogItemSchema);
export const updateProduct = (id: string, input: ProductCatalogInput) => apiPut(`org/products/${id}`, input, ProductCatalogItemSchema);
export const deleteProducts = (ids: string[]) => (ids.length === 1 ? apiDelete(`org/products/${ids[0]}`, DeletedSchema) : apiPost("org/products/delete", { ids }, DeletedSchema));
export const importProducts = (input: ImportProductCatalogInput) => apiPost("org/products/import", input, ImportProductCatalogResultSchema);
