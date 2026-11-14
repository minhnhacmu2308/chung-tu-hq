// Client HTTP hồ sơ: PATCH gửi đủ các trường đổi được (vd cờ gộp dòng hàng) – thiếu là thao tác thất bại im lặng ở chế độ http.
import { afterEach, describe, expect, it, vi } from "vitest";
import { updateDossier } from "./dossiers";

afterEach(() => vi.unstubAllGlobals());

describe("http updateDossier", () => {
  it("gửi mergeIdenticalLines (cả false), step, note; bỏ trường không đổi được", async () => {
    const bodies: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    }));
    await updateDossier("dos_1", { mergeIdenticalLines: true }).catch(() => undefined);
    await updateDossier("dos_1", { mergeIdenticalLines: false, step: "agent", note: "x", suspectFields: 3 }).catch(() => undefined);
    expect(bodies).toEqual([{ mergeIdenticalLines: true }, { note: "x", step: "agent", mergeIdenticalLines: false }]);
  });
});
