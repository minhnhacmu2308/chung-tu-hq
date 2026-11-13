import { describe, expect, it } from "vitest";
import { FakeCustomsGateway } from "../test/fake-customs-gateway.js";

const head = { declarationNo: "108007708100", registeredOn: "2026-02-27", typeCode: "A11", customsOffice: "02CI", taxCode: "0316789012", companyName: "AN PHAT", userId: "U1" };
const row = (sealNo: string) => ({ billNo: "BL1", containerNo: "FBIU5802429", sealNo, note: "" });

describe("FakeCustomsGateway – container list và KVGS", () => {
  it("seal bắt đầu bằng REJECT → từ chối kèm dòng; seal khác → chấp nhận", async () => {
    const g = new FakeCustomsGateway();
    const bad = await g.sendContainerList("o", { ...head, rows: [row("S1"), row("REJECT-1")] }, "k");
    expect(await g.containerListResult("o", { ...head, refId: bad.refId! })).toMatchObject({ state: "REJECTED", errors: [{ line: 2 }] });
    const good = await g.sendContainerList("o", { ...head, rows: [row("S1")] }, "k");
    expect(await g.containerListResult("o", { ...head, refId: good.refId! })).toMatchObject({ state: "ACCEPTED", receiptNo: expect.any(String) });
  });
  it("PENDING theo kịch bản; seal rỗng bị từ chối ngay khi gửi", async () => {
    const g = new FakeCustomsGateway({ refPendingPolls: 1 });
    expect((await g.sendContainerList("o", { ...head, rows: [row("")] }, "k")).errors?.[0]?.line).toBe(1);
    const { refId } = await g.sendContainerList("o", { ...head, rows: [row("S")] }, "k");
    expect((await g.containerListResult("o", { ...head, refId: refId! })).state).toBe("PENDING");
    expect((await g.containerListResult("o", { ...head, refId: refId! })).state).toBe("ACCEPTED");
  });
  it("KVGS hai bước: container và hàng lẻ; kịch bản REJECTED / INCOMPLETE", async () => {
    const kv = { declarationNo: "108007708100", registeredOn: "2026-02-27", customsOffice: "02CI", taxCode: "0316789012" };
    const g = new FakeCustomsGateway();
    const c = await g.requestKvgs("o", { ...kv, kind: "CONTAINER" }, "k");
    const rc = await g.kvgsResult("o", { ...kv, kind: "CONTAINER", refId: c.refId! });
    expect(rc.sheet?.containers).toHaveLength(1);
    const l = await g.requestKvgs("o", { ...kv, kind: "CARGO" }, "k");
    expect((await g.kvgsResult("o", { ...kv, kind: "CARGO", refId: l.refId! })).sheet?.cargo?.quantity).toBe("10");
    const rej = new FakeCustomsGateway({ kvgsOutcome: "REJECTED" });
    expect((await rej.kvgsResult("o", { ...kv, kind: "CARGO", refId: "x" })).state).toBe("REJECTED");
    const inc = await new FakeCustomsGateway({ kvgsOutcome: "INCOMPLETE" }).kvgsResult("o", { ...kv, kind: "CARGO", refId: "x" });
    expect(inc.sheet).toBeUndefined();
    expect(inc.errors?.[0]?.code).toBe("KVGS_RESPONSE_INCOMPLETE");
  });
});
