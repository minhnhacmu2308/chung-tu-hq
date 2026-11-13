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
  it("KVGS một bước: container (mặc định) / hàng lẻ theo kịch bản; REJECTED errorList; INCOMPLETE giữ raw", async () => {
    const kv = { declarationNo: "108007708100", registeredOn: "2026-02-27", customsOffice: "02CI", taxCode: "0316789012" };
    const g = new FakeCustomsGateway();
    const c = await g.fetchKvgs("o", kv, "k");
    expect(c).toMatchObject({ state: "ACCEPTED", sheet: { kind: "CONTAINER", barcode: null, declarationNo: "108007708100", declarationDate: "2026-02-27" } });
    expect(c.sheet?.containers[0]?.barcodeImage).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
    expect(g.kvgsCalls).toEqual([kv]);
    const l = await new FakeCustomsGateway({ kvgsKind: "CARGO" }).fetchKvgs("o", kv, "k");
    expect(l.sheet).toMatchObject({ kind: "CARGO", barcode: "108007708100", containers: [], cargo: { quantity: "10" } });
    const rej = await new FakeCustomsGateway({ kvgsOutcome: "REJECTED" }).fetchKvgs("o", kv, "k");
    expect(rej).toMatchObject({ state: "REJECTED", errors: [{ code: "E-KVGS-001" }] });
    expect(rej.sheet).toBeUndefined();
    const inc = await new FakeCustomsGateway({ kvgsOutcome: "INCOMPLETE" }).fetchKvgs("o", kv, "k");
    expect(inc).toMatchObject({ state: "REJECTED", raw: expect.anything(), errors: [{ code: "KVGS_RESPONSE_INCOMPLETE" }] });
  });
});
