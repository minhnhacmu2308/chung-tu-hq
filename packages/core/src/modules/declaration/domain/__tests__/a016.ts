// Danh mục cảng A016 thật của @kb/contracts cho test domain (application nạp sẵn bằng catalogsFor – domain không tự tải file).
import { loadCodeList } from "@kb/contracts";

export const A016 = (await loadCodeList("A016")).filter((p) => !p.inactive);
export const CATALOGS = { ports: A016.filter((p) => p.parent === "VN"), worldPorts: A016 };
