import { describe, expect, it } from "vitest";
import { meterSafely, RecordingUsageMeter, type ServiceUsage } from "./usage.js";

const ev: ServiceUsage = { orgId: "org_a", dossierId: "dos_1", provider: "CUSTOMS_HUB", kind: "CUSTOMS_SEND", operation: "IDA", quantity: 1, dedupeKey: "customs:dos_1:IDA:v1" };

describe("meterSafely", () => {
  it("ghi qua meter; không nối meter → bỏ qua", async () => {
    const m = new RecordingUsageMeter();
    await meterSafely(m, ev);
    await meterSafely(undefined, ev);
    expect(m.events).toEqual([ev]);
  });
  it("meter lỗi → không ném, chỉ log (nghiệp vụ đã chạy không bị hỏng)", async () => {
    const m = new RecordingUsageMeter();
    m.fail = true;
    const logs: string[] = [];
    await expect(meterSafely(m, ev, (s) => logs.push(s))).resolves.toBeUndefined();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain("CUSTOMS_HUB IDA");
  });
});
