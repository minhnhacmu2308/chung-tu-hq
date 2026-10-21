import { beforeEach, describe, expect, it } from "vitest";
import { getDb, resetDb } from "@/mocks/db";
import { approveJoinRequest, listJoinRequests, listMembers, rejectJoinRequest, transferOwnership } from "./settings";

const code = async (p: Promise<unknown>) => p.then(() => "OK", (e: { code?: string }) => e.code);
const actAs = (id: string) => {
  getDb().currentUserId = id;
};
const roleOf = (id: string) => getDb().members.find((m) => m.id === id)?.role;

beforeEach(() => resetDb());

describe("yêu cầu tham gia (mock)", () => {
  it("ADMIN thấy danh sách chờ; duyệt → thành viên DECLARANT đang hoạt động, rời danh sách", async () => {
    const list = await listJoinRequests();
    expect(list.map((j) => j.id)).toEqual(["jr_thinh", "jr_ngoc"]);
    const m = await approveJoinRequest("jr_thinh");
    expect(m).toMatchObject({ email: "thinh.man@anphat-demo.vn", role: "DECLARANT", status: "ACTIVE" });
    expect((await listMembers()).some((x) => x.email === "thinh.man@anphat-demo.vn")).toBe(true);
    expect((await listJoinRequests()).map((j) => j.id)).toEqual(["jr_ngoc"]);
  });
  it("từ chối có/không lý do → rời danh sách, không thành thành viên; lần 2 → NOT_FOUND; lý do > 500 ký tự → VALIDATION", async () => {
    expect(await code(rejectJoinRequest("jr_ngoc", { reason: "x".repeat(501) }))).toBe("VALIDATION");
    await rejectJoinRequest("jr_ngoc", { reason: "Không phải nhân viên" });
    await rejectJoinRequest("jr_thinh", {});
    expect(await listJoinRequests()).toEqual([]);
    expect(getDb().members.some((m) => m.email === "ngoc.luong@gmail-demo.vn")).toBe(false);
    expect(await code(rejectJoinRequest("jr_ngoc", {}))).toBe("NOT_FOUND");
    expect(await code(approveJoinRequest("jr_ngoc"))).toBe("NOT_FOUND");
  });
  it("vai trò không quản trị → FORBIDDEN, danh sách giữ nguyên", async () => {
    actAs("usr_ha");
    expect(await code(listJoinRequests())).toBe("FORBIDDEN");
    expect(await code(rejectJoinRequest("jr_ngoc", {}))).toBe("FORBIDDEN");
    expect(await code(approveJoinRequest("jr_ngoc"))).toBe("FORBIDDEN");
    expect(getDb().joinRequests).toHaveLength(2);
  });
});

describe("chuyển quyền sở hữu (mock)", () => {
  it("OWNER chuyển cho thành viên đang hoạt động → người nhận OWNER, mình thành ADMIN", async () => {
    actAs("usr_phong");
    const res = await transferOwnership("usr_ha", { password: "demo1234" });
    expect(res.owner).toMatchObject({ id: "usr_ha", role: "OWNER" });
    expect(res.previousOwner).toMatchObject({ id: "usr_phong", role: "ADMIN" });
    expect(getDb().members.filter((m) => m.role === "OWNER").map((m) => m.id)).toEqual(["usr_ha"]);
    // chủ cũ không chuyển tiếp được nữa
    expect(await code(transferOwnership("usr_tuan", { password: "demo1234" }))).toBe("FORBIDDEN");
  });
  it("chặn: không phải OWNER, chính mình, người đã khóa/chưa nhận lời mời, người lạ, sai mật khẩu", async () => {
    expect(await code(transferOwnership("usr_ha", { password: "demo1234" }))).toBe("FORBIDDEN"); // usr_chau là ADMIN
    actAs("usr_phong");
    expect(await code(transferOwnership("usr_phong", { password: "demo1234" }))).toBe("FORBIDDEN");
    expect(await code(transferOwnership("usr_quang", { password: "demo1234" }))).toBe("INVALID_STATE");
    expect(await code(transferOwnership("usr_linh", { password: "demo1234" }))).toBe("INVALID_STATE");
    expect(await code(transferOwnership("usr_khac", { password: "demo1234" }))).toBe("NOT_FOUND");
    expect(await code(transferOwnership("usr_ha", { password: "" }))).toBe("INVALID_CREDENTIALS");
    expect(roleOf("usr_phong")).toBe("OWNER");
    expect(roleOf("usr_ha")).toBe("DECLARANT");
  });
});
