// Danh mục VNACCS đầy đủ dùng khi dựng tờ khai: cảng Việt Nam (A016) và địa điểm lưu kho của chi cục khai báo (A202).
// loadCodeList có cache theo tiến trình; lọc cảng VN cũng chỉ làm một lần.
import { loadCodeList, officeCodeAliases } from "@kb/contracts";
import type { DeclarationCatalogs } from "../domain/build.js";

let vnPorts: Promise<NonNullable<DeclarationCatalogs["ports"]>> | null = null;

export async function catalogsFor(customsOfficeCode: string): Promise<DeclarationCatalogs> {
  vnPorts ??= loadCodeList("A016").then((all) => all.filter((p) => p.parent === "VN" && !p.inactive));
  const offices = new Set(officeCodeAliases(customsOfficeCode));
  const [ports, warehouses] = await Promise.all([vnPorts, loadCodeList("A202")]);
  return { ports, warehouses: warehouses.filter((w) => !w.inactive && w.parent !== undefined && offices.has(w.parent)) };
}
