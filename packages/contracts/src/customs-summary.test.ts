import { describe, expect, it } from "vitest";
import { dossierCustomsSummary } from "./customs-summary.js";

describe("dossierCustomsSummary – trạng thái hồ sơ gộp từ các tờ khai nhánh", () => {
  it("3 nhánh [CLEARED, REJECTED, DECLARED] → 1/3 thông quan, tờ 2 bị từ chối, chưa xong", () => {
    expect(dossierCustomsSummary([
      { stage: "CLEARED", state: "CLEARED" },
      { stage: "REJECTED", state: "REJECTED" },
      { stage: "DECLARED", state: "DECLARED" },
    ])).toEqual({ of: 3, cleared: 1, problems: [{ no: 2, kind: "REJECTED" }], allCleared: false });
  });

  it("mọi nhánh thông quan (kể cả đang sửa sau thông quan) → allCleared", () => {
    expect(dossierCustomsSummary([{ stage: "CLEARED", state: "CLEARED" }, { stage: "POST_EDITING", state: "CLEARED" }])).toEqual({ of: 2, cleared: 2, problems: [], allCleared: true });
  });

  it("lỗi gửi (SEND_FAILED) nêu số tờ; lô một tờ chưa thông quan; không có nhánh → chưa xong", () => {
    expect(dossierCustomsSummary([{ stage: "PRE_DECLARED", state: "PRE_DECLARED" }, { stage: "NOT_SENT", state: "SEND_FAILED" }])).toEqual({ of: 2, cleared: 0, problems: [{ no: 2, kind: "SEND_FAILED" }], allCleared: false });
    expect(dossierCustomsSummary([{ stage: "DECLARED", state: "DECLARED" }])).toEqual({ of: 1, cleared: 0, problems: [], allCleared: false });
    expect(dossierCustomsSummary([{ stage: "CLEARED", state: "CLEARED" }])).toMatchObject({ of: 1, cleared: 1, allCleared: true });
    expect(dossierCustomsSummary([])).toEqual({ of: 0, cleared: 0, problems: [], allCleared: false });
  });
});
