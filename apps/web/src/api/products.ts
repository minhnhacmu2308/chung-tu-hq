// Danh mục hàng hóa của doanh nghiệp. Chọn mock|http theo NEXT_PUBLIC_DATA_SOURCE.
import { pick } from "@/lib/data-source";
import * as mock from "@/mocks/api/products";
import * as http from "./http/products";

export const productKeys = mock.productKeys;
export const listProducts = pick(mock.listProducts, http.listProducts);
export const createProduct = pick(mock.createProduct, http.createProduct);
export const updateProduct = pick(mock.updateProduct, http.updateProduct);
export const deleteProducts = pick(mock.deleteProducts, http.deleteProducts);
export const importProducts = pick(mock.importProducts, http.importProducts);
