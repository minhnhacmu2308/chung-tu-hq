import { describe, expect, it } from "vitest";
import { createLogger, parseLogLevel, sanitizeFields } from "./log.js";

const capture = () => {
  const lines: { level: string; rec: Record<string, unknown> }[] = [];
  const log = createLogger({ level: "debug", name: "test", sink: (line, level) => lines.push({ level, rec: JSON.parse(line) as Record<string, unknown> }), now: () => new Date("2026-10-23T00:00:00.000Z") });
  return { log, lines };
};

describe("createLogger", () => {
  it("ghi một dòng JSON: thời điểm, mức, tên, msg và trường kèm theo", () => {
    const { log, lines } = capture();
    log.info("đã nhận job", { jobId: "j1", orgId: "org_a" });
    expect(lines).toEqual([{ level: "info", rec: { t: "2026-10-23T00:00:00.000Z", level: "info", name: "test", msg: "đã nhận job", jobId: "j1", orgId: "org_a" } }]);
  });
  it("mức thấp hơn ngưỡng không ghi; parseLogLevel bỏ giá trị lạ", () => {
    const lines: string[] = [];
    const log = createLogger({ level: "warn", sink: (l) => lines.push(l) });
    log.info("bỏ qua");
    log.warn("ghi");
    expect(lines).toHaveLength(1);
    expect(parseLogLevel("tào lao")).toBe("info");
    expect(parseLogLevel("error")).toBe("error");
  });
  it("child mang sẵn trường; trường gọi sau ghi đè", () => {
    const { log, lines } = capture();
    log.child({ jobId: "j1", attempt: 1 }).error("lỗi", { attempt: 2, err: new Error("boom") });
    expect(lines[0]!.rec).toMatchObject({ jobId: "j1", attempt: 2, err: { name: "Error", message: "boom" } });
  });
  it("che khóa nhạy cảm, không lộ mật khẩu/token/khóa API", () => {
    const out = sanitizeFields({ password: "x", apiKey: "y", Authorization: "Bearer z", HSCODEPRO_INTERNAL_KEY: "k", nested: { sessionToken: "t", ok: 1 }, plain: "giữ" });
    expect(out).toEqual({ password: "[che]", apiKey: "[che]", Authorization: "[che]", HSCODEPRO_INTERNAL_KEY: "[che]", nested: { sessionToken: "[che]", ok: 1 }, plain: "giữ" });
  });
  it("vòng tham chiếu không làm treo: cắt ở độ sâu 4", () => {
    const a: Record<string, unknown> = {};
    a["self"] = a;
    const { log, lines } = capture();
    log.info("vòng", { a });
    expect(JSON.stringify(lines[0]!.rec)).toContain("[sâu]");
  });
});
