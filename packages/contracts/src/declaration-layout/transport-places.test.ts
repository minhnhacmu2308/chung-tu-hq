import { describe, expect, it } from "vitest";
import { loadCodeList } from "../code-lists/index.js";
import { declarationRequiredGaps, requiredGaps } from "./required.js";
import { fixedPlaceCode, inPlaceScope, placeNameSource, plainUpper, sendsPlaceName, TRANSPORT_PLACES, transportPlaceChanges, transportPlaceIssues, transportPlaceScope } from "./transport-places.js";

describe("địa điểm xếp / dỡ hàng theo PTVC (1.33 / 1.34, 2.28 / 2.29)", () => {
  it("nhập: dỡ hàng = Việt Nam theo PTVC, xếp hàng = nước ngoài; xuất: xếp hàng = Việt Nam theo PTVC, nhận hàng cuối = nước ngoài", () => {
    expect(transportPlaceScope("IDA", "VD_DST", { TK_MTC: "1" })).toEqual({ domestic: true, mode: "1" });
    expect(transportPlaceScope("IDA", "VD_PSC", { TK_MTC: "1" })).toEqual({ domestic: false });
    expect(transportPlaceScope("EDA", "TK_PSC", { TK_MTC: "4" })).toEqual({ domestic: true, mode: "4" });
    expect(transportPlaceScope("EDA", "TK_DSC", { TK_MTC: "4" })).toEqual({ domestic: false });
    expect(transportPlaceScope("IDA", "VD_DST", {})).toEqual({ domestic: true, mode: null });
    expect(transportPlaceScope("IDA", "VD_ST", {})).toBeNull();
  });

  it("danh mục A016 lọc đúng: PTVC 1/2/3/6 và 4/5 có địa điểm trong nước riêng; nước ngoài không có mã VN", async () => {
    const a016 = await loadCodeList("A016");
    const pick = (scope: Parameters<typeof inPlaceScope>[0]) => a016.filter((e) => inPlaceScope(scope, e));
    const air = pick({ domestic: true, mode: "1" }), road = pick({ domestic: true, mode: "4" }), abroad = pick({ domestic: false });
    expect(air.map((e) => e.code)).toEqual(expect.arrayContaining(["VNCLI", "VNHPH", "VNSGN"]));
    expect(road.length).toBeGreaterThan(900);
    expect(air.every((e) => e.parent === "VN" && e.modes?.includes("1"))).toBe(true);
    expect(road.every((e) => e.modes?.includes("4"))).toBe(true);
    expect(road.some((e) => e.code === "VNCLI")).toBe(false);
    expect(abroad.map((e) => e.code)).toEqual(expect.arrayContaining(["SGSIN", "KRPUS"]));
    expect(abroad.some((e) => e.parent === "VN")).toBe(false);
    expect(pick({ onSite: true })).toEqual([]);
  });

  it("PTVC 9: không tra danh mục, cả 2 ô mã = VNZZZ (khóa); rời PTVC 9 → bỏ VNZZZ", () => {
    expect(transportPlaceScope("IDA", "VD_PSC", { TK_MTC: "9" })).toEqual({ onSite: true });
    expect(fixedPlaceCode("IDA", "VD_DST", { TK_MTC: "9" })).toBe("VNZZZ");
    expect(fixedPlaceCode("EDA", "TK_DSC", { TK_MTC: "9" })).toBe("VNZZZ");
    expect(fixedPlaceCode("IDA", "VD_DST", { TK_MTC: "2" })).toBeNull();
    expect(fixedPlaceCode("IDA", "VD_DSN", { TK_MTC: "9" })).toBeNull();
    expect(transportPlaceChanges("IDA", { TK_MTC: "2", VD_DST: "VNCLI", VD_PSC: "SGSIN", VD_DSN: "Cát Lái" }, "TK_MTC", "9"))
      .toEqual({ TK_MTC: "9", VD_DST: "VNZZZ", VD_PSC: "VNZZZ", VD_DSN: "CAT LAI" });
    expect(transportPlaceChanges("EDA", { TK_MTC: "9", TK_DSC: "VNZZZ", TK_PSC: "VNZZZ" }, "TK_MTC", "2")).toEqual({ TK_MTC: "2", TK_DSC: "", TK_PSC: "", TK_VSC: "9999" });
    expect(transportPlaceChanges("IDA", { TK_MTC: "2" }, "TK_MTC", "1")).toEqual({ TK_MTC: "1" });
  });

  it("PTVC 9: tên in hoa, bỏ dấu; tên trống / sai dạng / mã khác VNZZZ → chặn duyệt, khai", () => {
    expect(plainUpper("Kho Công ty Đức Thành")).toBe("KHO CONG TY DUC THANH");
    // Gõ tên: ô nhập tự chuyển (giữ con trỏ) – hàm đổi ô không sửa giá trị đang gõ.
    expect(transportPlaceChanges("IDA", { TK_MTC: "9" }, "VD_DSN", "kho đồng nai")).toEqual({ VD_DSN: "kho đồng nai" });
    const v = { TK_MTC: "9", VD_DST: "VNZZZ", VD_PSC: "VNCLI", VD_DSN: "", VD_PSN: "Kho Bình Dương" };
    expect(transportPlaceIssues("IDA", v)).toEqual([
      { key: "VD_DSN", no: "1.33", reason: "NAME_REQUIRED" },
      { key: "VD_PSC", no: "1.34", reason: "CODE_FIXED" },
      { key: "VD_PSN", no: "1.34", reason: "NAME_FORMAT" },
    ]);
    expect(transportPlaceIssues("IDA", { ...v, VD_PSC: "VNZZZ", VD_DSN: "KHO A", VD_PSN: "KHO B" })).toEqual([]);
    expect(transportPlaceIssues("IDA", { TK_MTC: "2" })).toEqual([]);
    const gaps = requiredGaps("IDA", v, []).filter((g) => g.no === "1.33" || g.no === "1.34");
    expect(gaps.map((g) => g.key).sort()).toEqual(["VD_DSN", "VD_PSC", "VD_PSN"]);
  });

  it("tên địa điểm: PTVC 9 / mã …ZZZ → người khai nhập, gửi cả mã và tên; còn lại → tên theo mã A016, chỉ gửi mã", () => {
    expect(sendsPlaceName("9", "VNZZZ")).toBe(true);
    expect(sendsPlaceName("2", "CNZZZ")).toBe(true);
    expect(sendsPlaceName("2", "VNCLI")).toBe(false);
    expect(placeNameSource("IDA", "VD_DSN", { TK_MTC: "2", VD_DST: "VNCLI" })).toBe("VD_DST");
    expect(placeNameSource("IDA", "VD_DSN", { TK_MTC: "9", VD_DST: "VNZZZ" })).toBeNull();
    expect(placeNameSource("IDA", "VD_PSN", { TK_MTC: "2", VD_PSC: "CNZZZ" })).toBeNull();
    expect(placeNameSource("IDA", "VD_ST", { TK_MTC: "2" })).toBeNull();
    const names: Record<string, string> = { VNCLI: "CANG CAT LAI (HCM)", SGSIN: "SINGAPORE" };
    const look = (c: string) => names[c];
    // Đổi mã → tên theo mã mới; mã không có trong danh mục → tên trống.
    expect(transportPlaceChanges("IDA", { TK_MTC: "2", VD_DST: "VNHPH", VD_DSN: "HAI PHONG" }, "VD_DST", "VNCLI", look)).toEqual({ VD_DST: "VNCLI", VD_DSN: "CANG CAT LAI (HCM)" });
    expect(transportPlaceChanges("IDA", { TK_MTC: "2", VD_DST: "VNCLI", VD_DSN: "CANG CAT LAI (HCM)" }, "VD_DST", "VNXXX", look)).toEqual({ VD_DST: "VNXXX", VD_DSN: "" });
    // Mã …ZZZ → bỏ tên tự điền, người khai nhập.
    expect(transportPlaceChanges("IDA", { TK_MTC: "2", VD_PSC: "SGSIN", VD_PSN: "SINGAPORE" }, "VD_PSC", "CNZZZ", look)).toEqual({ VD_PSC: "CNZZZ", VD_PSN: "" });
    // Rời PTVC 9 → mã bỏ VNZZZ, tên nhập tay bỏ theo.
    expect(transportPlaceChanges("EDA", { TK_MTC: "9", TK_DSC: "VNZZZ", TK_DSN: "KHO A", TK_PSC: "VNZZZ", TK_PSN: "KHO B" }, "TK_MTC", "2", look))
      .toEqual({ TK_MTC: "2", TK_DSC: "", TK_DSN: "", TK_PSC: "", TK_PSN: "", TK_VSC: "9999" });
    // Tên theo mã không bao giờ báo thiếu; mã …ZZZ thì tên bắt buộc.
    expect(transportPlaceIssues("IDA", { TK_MTC: "2", VD_DST: "VNCLI", VD_PSC: "CNZZZ" })).toEqual([{ key: "VD_PSN", no: "1.34", reason: "NAME_REQUIRED" }]);
    const keys = requiredGaps("IDA", { TK_MTC: "2", VD_DST: "VNCLI", VD_PSC: "SGSIN" }, []).map((g) => g.key);
    expect(keys).not.toContain("VD_DSN");
    expect(keys).not.toContain("VD_PSN");
  });

  it("ô tên địa điểm lưu kho / đích bảo thuế chỉ đọc – không bao giờ bị báo thiếu", () => {
    const keys = requiredGaps("IDA", {}, []).map((g) => g.key);
    expect(keys).not.toContain("APP_TEN_KHO");
    expect(keys).not.toContain("APP_TEN_ARP");
  });

  it("1.31 / 2.30 ô 1: PTVC 2, 3, 6 → 9999; mã khác → trống cho người khai nhập; đổi PTVC thì đổi theo", () => {
    expect(transportPlaceChanges("IDA", { TK_MTC: "1" }, "TK_MTC", "2")).toEqual({ TK_MTC: "2", VD_VSC: "9999" });
    expect(transportPlaceChanges("EDA", { TK_MTC: "4", TK_VSC: "51C12345" }, "TK_MTC", "3")).toEqual({ TK_MTC: "3", TK_VSC: "9999" });
    expect(transportPlaceChanges("IDA", { TK_MTC: "2", VD_VSC: "9999" }, "TK_MTC", "1")).toEqual({ TK_MTC: "1", VD_VSC: "" });
    expect(transportPlaceChanges("EDA", { TK_MTC: "6", TK_VSC: "9999" }, "TK_MTC", "5")).toEqual({ TK_MTC: "5", TK_VSC: "" });
    // Đổi giữa 2, 3, 6: giữ hô hiệu thật đang có; đang trống → 9999.
    expect(transportPlaceChanges("IDA", { TK_MTC: "2", VD_VSC: "3FZA7" }, "TK_MTC", "6")).toEqual({ TK_MTC: "6" });
    expect(transportPlaceChanges("IDA", { TK_MTC: "2", VD_VSC: "" }, "TK_MTC", "3")).toEqual({ TK_MTC: "3", VD_VSC: "9999" });
    // Đổi giữa các mã khác: giữ giá trị người khai nhập.
    expect(transportPlaceChanges("EDA", { TK_MTC: "1", TK_VSC: "VN0123" }, "TK_MTC", "4")).toEqual({ TK_MTC: "4" });
    // Bắt buộc chỉ khi đường biển / sông.
    const gap = (kind: "IDA" | "EDA", v: Record<string, string>) => requiredGaps(kind, v, []).some((g) => g.key === (kind === "IDA" ? "VD_VSC" : "TK_VSC"));
    expect(gap("IDA", { TK_MTC: "2" })).toBe(true);
    expect(gap("IDA", { TK_MTC: "2", VD_VSC: "9999" })).toBe(false);
    expect(gap("IDA", { TK_MTC: "1" })).toBe(false);
    expect(gap("EDA", { TK_MTC: "3" })).toBe(true);
    expect(gap("EDA", { TK_MTC: "4" })).toBe(false);
  });

  it("PTVC 9 dựng tự động (chỉ có mã VNZZZ, chưa có tên): tên trống, báo thiếu – không lấy mã làm tên", () => {
    for (const kind of ["IDA", "EDA"] as const) {
      const gaps = declarationRequiredGaps(kind, [{ code: "PTVC", value: "9" }, { code: "CANG_DO", value: "VNZZZ" }, { code: "CANG_XEP", value: "VNZZZ" }], []);
      const names = TRANSPORT_PLACES[kind].map((p) => p.name);
      expect(gaps.filter((g) => names.includes(g.key)).map((g) => g.key).sort()).toEqual([...names].sort());
    }
  });
});
