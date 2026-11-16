import { beforeEach, describe, expect, it } from "vitest";
import { RecordingOrgAudit } from "../../../../shared/audit.js";
import { fixedClock } from "../../../../shared/clock.js";
import type { Ctx } from "../../../../shared/ctx.js";
import { asOrgId, asUserId, sequentialIdGen } from "../../../../shared/ids.js";
import { errCode, unwrap } from "../../../../shared/result.js";
import { sniffImage } from "@kb/contracts";
import { checkImage } from "../../domain/image.js";
import { readMemberAvatar, readOrgLogo, removeMyAvatar, removeOrgLogo, setMyAvatar, setOrgLogo, updateOrgBrandName } from "../branding.js";
import type { IdentityDeps, ImageStore } from "../ports.js";
import { FakeHasher, FakeTaxRegistry, InMemoryRateLimiter, RecordingMailer } from "../test/fakes.js";
import { InMemoryIdentityUow } from "../test/in-memory-uow.js";

const T0 = "2026-11-16T00:00:00.000Z";
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0, 0, 0, 0]), Buffer.from("WEBPVP8 ")]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const GIF = Buffer.from("GIF89a....");
const ctx = (role: Ctx["role"], userId = "usr_chau", orgId = "org_a"): Ctx => ({ orgId: asOrgId(orgId), userId: asUserId(userId), role });

class MemoryImages implements ImageStore {
  readonly files = new Map<string, Buffer>();
  async put(key: string, body: Buffer) {
    this.files.set(key, body);
  }
  async get(key: string) {
    const b = this.files.get(key);
    if (!b) throw new Error("NoSuchKey");
    return b;
  }
  async delete(key: string) {
    this.files.delete(key);
  }
}

let uow: InMemoryIdentityUow;
let images: MemoryImages;
let audit: RecordingOrgAudit;
let deps: IdentityDeps;
beforeEach(() => {
  const day = new Date(T0);
  uow = new InMemoryIdentityUow().seed({
    plans: [{ code: "PAYG", name: "Theo lượt", kind: "PAYG" as const, pagesPerDossier: 40, pricePerDeclarationVnd: "25000" }],
    orgs: [
      { id: "org_a", taxCode: "0316789012", name: "AN PHÁT", address: "", phone: "", planCode: "PAYG", suspectThreshold: "BALANCED", fourEyes: false, createdAt: day },
      { id: "org_b", taxCode: "0100000002", name: "B", address: "", phone: "", planCode: "PAYG", suspectThreshold: "BALANCED", fourEyes: false, createdAt: day },
    ],
    users: [
      { id: "usr_chau", email: "chau@a.vn", passwordHash: "h", name: "Châu", emailVerifiedAt: day, createdAt: day },
      { id: "usr_ha", email: "ha@a.vn", passwordHash: "h", name: "Hà", emailVerifiedAt: day, createdAt: day },
      { id: "usr_b", email: "b@b.vn", passwordHash: "h", name: "B", emailVerifiedAt: day, createdAt: day },
    ],
    memberships: [
      { id: "mem_chau", orgId: "org_a", userId: "usr_chau", role: "ADMIN", status: "ACTIVE", invitedBy: null },
      { id: "mem_ha", orgId: "org_a", userId: "usr_ha", role: "DECLARANT", status: "ACTIVE", invitedBy: null },
      { id: "mem_b", orgId: "org_b", userId: "usr_b", role: "OWNER", status: "ACTIVE", invitedBy: null },
    ],
  });
  images = new MemoryImages();
  audit = new RecordingOrgAudit();
  const clock = fixedClock(T0);
  deps = { uow, plans: uow, hasher: new FakeHasher(), rateLimiter: new InMemoryRateLimiter(clock), mailer: new RecordingMailer(), taxRegistry: new FakeTaxRegistry(), clock, idGen: sequentialIdGen(), appUrl: "http://x", images, audit };
});

describe("nhận dạng ảnh theo byte đầu", () => {
  it("PNG / JPEG / WebP nhận; SVG, GIF, rỗng bị từ chối dù khai mime gì", () => {
    expect(sniffImage(PNG)).toEqual({ mime: "image/png", ext: "png" });
    expect(sniffImage(JPG)).toEqual({ mime: "image/jpeg", ext: "jpg" });
    expect(sniffImage(WEBP)).toEqual({ mime: "image/webp", ext: "webp" });
    for (const b of [SVG, GIF, Buffer.alloc(0), Buffer.from("RIFF0000WAVE")]) expect(sniffImage(b)).toBeNull();
    const bad = checkImage(SVG);
    expect(bad.ok ? null : bad.error).toMatchObject({ code: "FILE_INVALID", reason: "IMAGE_TYPE_UNSUPPORTED" });
  });
  it("quá 1 MB → FILE_TOO_LARGE kèm mã lý do", () => {
    const big = Buffer.concat([PNG, Buffer.alloc(1024 * 1024)]);
    const r = checkImage(big);
    expect(r.ok ? null : r.error).toMatchObject({ code: "FILE_TOO_LARGE", reason: "IMAGE_TOO_LARGE", params: { max: "1 MB" } });
    expect(checkImage(PNG).ok).toBe(true);
  });
});

describe("thương hiệu doanh nghiệp", () => {
  it("đổi tên: trim, '' → null; chỉ Quản trị/Chủ sở hữu; ghi nhật ký", async () => {
    expect(unwrap(await updateOrgBrandName(deps, ctx("ADMIN"), { name: "  An Phát Logistics " })).brand.name).toBe("An Phát Logistics");
    expect(unwrap(await updateOrgBrandName(deps, ctx("ADMIN"), { name: "" })).brand.name).toBeNull();
    expect(errCode(await updateOrgBrandName(deps, ctx("DECLARANT", "usr_ha"), { name: "X" }))).toBe("FORBIDDEN");
    expect(audit.entries.map((e) => e.action)).toEqual(["ORG_BRAND_NAME", "ORG_BRAND_NAME"]);
  });

  it("đặt logo: ghi kho theo khóa branding/<org>/, DB trỏ ảnh mới, xóa ảnh cũ; logoVersion đổi; đọc lại đúng mime", async () => {
    const o1 = unwrap(await setOrgLogo(deps, ctx("ADMIN"), PNG));
    expect(o1.brand.logoVersion).toBe(T0);
    const k1 = uow.data.orgs[0]!.logoKey!;
    expect(k1).toMatch(/^branding\/org_a\/logo-img_\d+\.png$/);
    unwrap(await setOrgLogo(deps, ctx("ADMIN"), JPG));
    const k2 = uow.data.orgs[0]!.logoKey!;
    expect(k2).toMatch(/\.jpg$/);
    expect([...images.files.keys()]).toEqual([k2]);
    expect(await readOrgLogo(deps, ctx("VIEWER", "usr_ha"))).toEqual({ bytes: JPG, mime: "image/jpeg" });
    // Org khác không thấy logo của A.
    expect(await readOrgLogo(deps, ctx("OWNER", "usr_b", "org_b"))).toBeNull();
    expect(audit.entries.map((e) => e.action)).toEqual(["ORG_LOGO_SET", "ORG_LOGO_SET"]);
  });

  it("logo SVG / GIF / quá lớn bị từ chối, không ghi kho; người không phải quản trị → FORBIDDEN", async () => {
    expect(errCode(await setOrgLogo(deps, ctx("ADMIN"), SVG))).toBe("FILE_INVALID");
    expect(errCode(await setOrgLogo(deps, ctx("ADMIN"), GIF))).toBe("FILE_INVALID");
    expect(errCode(await setOrgLogo(deps, ctx("ADMIN"), Buffer.concat([PNG, Buffer.alloc(1024 * 1024)])))).toBe("FILE_TOO_LARGE");
    expect(errCode(await setOrgLogo(deps, ctx("DECLARANT", "usr_ha"), PNG))).toBe("FORBIDDEN");
    expect(images.files.size).toBe(0);
  });

  it("gỡ logo: xóa ảnh trong kho, logoVersion null; đọc → null; thiếu kho → INTEGRATION_NOT_CONFIGURED khi đặt", async () => {
    unwrap(await setOrgLogo(deps, ctx("ADMIN"), PNG));
    expect(errCode(await removeOrgLogo(deps, ctx("DECLARANT", "usr_ha")))).toBe("FORBIDDEN");
    expect(unwrap(await removeOrgLogo(deps, ctx("OWNER"))).brand.logoVersion).toBeNull();
    expect(images.files.size).toBe(0);
    expect(await readOrgLogo(deps, ctx("ADMIN"))).toBeNull();
    const { images: _, ...noImages } = deps;
    expect(errCode(await setOrgLogo(noImages, ctx("ADMIN"), PNG))).toBe("INTEGRATION_NOT_CONFIGURED");
  });

  it("xóa ảnh cũ lỗi không làm hỏng thao tác (file mồ côi, DB vẫn trỏ ảnh mới)", async () => {
    unwrap(await setOrgLogo(deps, ctx("ADMIN"), PNG));
    images.delete = async () => {
      throw new Error("kho lỗi");
    };
    expect(unwrap(await setOrgLogo(deps, ctx("ADMIN"), WEBP)).brand.logoVersion).toBe(T0);
    expect(uow.data.orgs[0]!.logoKey).toMatch(/\.webp$/);
  });
});

describe("ảnh đại diện", () => {
  it("mỗi người tự đổi ảnh của mình; avatarVersion; thành viên cùng org đọc được; org khác → NOT_FOUND", async () => {
    const me = unwrap(await setMyAvatar(deps, ctx("DECLARANT", "usr_ha"), PNG));
    expect(me).toMatchObject({ id: "usr_ha", avatarVersion: T0 });
    expect(uow.data.users.find((u) => u.id === "usr_ha")?.avatarKey).toMatch(/^avatars\/usr_ha\/img_\d+\.png$/);
    expect(unwrap(await readMemberAvatar(deps, ctx("VIEWER", "usr_chau"), "usr_ha"))).toEqual({ bytes: PNG, mime: "image/png" });
    expect(errCode(await readMemberAvatar(deps, ctx("OWNER", "usr_b", "org_b"), "usr_ha"))).toBe("NOT_FOUND");
    expect(errCode(await readMemberAvatar(deps, ctx("ADMIN"), "usr_chau"))).toBe("NOT_FOUND");
  });

  it("đổi ảnh xóa ảnh cũ; gỡ ảnh → avatarVersion null; ảnh sai loại bị từ chối", async () => {
    unwrap(await setMyAvatar(deps, ctx("ADMIN"), PNG));
    unwrap(await setMyAvatar(deps, ctx("ADMIN"), JPG));
    expect(images.files.size).toBe(1);
    expect(errCode(await setMyAvatar(deps, ctx("ADMIN"), SVG))).toBe("FILE_INVALID");
    expect(unwrap(await removeMyAvatar(deps, ctx("ADMIN"))).avatarVersion).toBeNull();
    expect(images.files.size).toBe(0);
  });
});
