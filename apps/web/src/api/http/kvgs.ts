// Qua khu vực giám sát – gọi backend thật. Cùng chữ ký với src/mocks/api/kvgs.ts.
import { KvgsViewSchema, type SaveContainerListInput } from "@kb/contracts";
import { z } from "zod";
import { apiGet, apiPost, apiPut } from "@/lib/http";

const base = (dossierId: string, branch: number) => `dossiers/${dossierId}/kvgs/${branch}`;
const PollResult = z.object({ again: z.boolean() });

export const getKvgs = (dossierId: string, branch: number) => apiGet(base(dossierId, branch), KvgsViewSchema);
export const saveContainerList = (dossierId: string, branch: number, input: SaveContainerListInput) => apiPut(`${base(dossierId, branch)}/container-list`, input, KvgsViewSchema);
export const refillContainerList = (dossierId: string, branch: number) => apiPost(`${base(dossierId, branch)}/container-list/refill`, {}, KvgsViewSchema);
export const sendContainerList = (dossierId: string, branch: number) => apiPost(`${base(dossierId, branch)}/container-list/send`, {}, KvgsViewSchema);
export const fetchKvgs = (dossierId: string, branch: number) => apiPost(`${base(dossierId, branch)}/fetch`, {}, KvgsViewSchema);
/** "Lấy phản hồi" danh sách container (V5ContainerRes). KVGS không có bước này – lấy bảng kê là một lời gọi đồng bộ. */
export const pollContainerList = (dossierId: string, branch: number) => apiPost(`${base(dossierId, branch)}/container-list/poll`, {}, PollResult);
