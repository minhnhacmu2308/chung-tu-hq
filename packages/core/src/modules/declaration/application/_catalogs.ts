// Danh mục VNACCS đầy đủ dùng khi dựng tờ khai: cảng (A016 – toàn bộ và riêng Việt Nam) và địa điểm lưu kho của chi cục khai báo (A202).
// loadCodeList có cache theo tiến trình; lọc cảng VN cũng chỉ làm một lần.
import { loadCodeList, officeCodeAliases } from "@kb/contracts";
import type { DeclarationCatalogs } from "../domain/build.js";

let worldPorts: Promise<NonNullable<DeclarationCatalogs["ports"]>> | null = null;
let vnPorts: Promise<NonNullable<DeclarationCatalogs["ports"]>> | null = null;

export async function catalogsFor(customsOfficeCode: string): Promise<DeclarationCatalogs> {
  worldPorts ??= loadCodeList("A016").then((all) => all.filter((p) => !p.inactive));
  vnPorts ??= worldPorts.then((all) => all.filter((p) => p.parent === "VN"));
  const offices = new Set(officeCodeAliases(customsOfficeCode));
  const [ports, world, warehouses] = await Promise.all([vnPorts, worldPorts, loadCodeList("A202")]);
  return { ports, worldPorts: world, warehouses: warehouses.filter((w) => !w.inactive && w.parent !== undefined && offices.has(w.parent)) };
}
