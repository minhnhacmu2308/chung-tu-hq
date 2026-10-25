import { describe, expect, it } from "vitest";
import {
  baseOp, CUSTOMS_OPERATIONS, nextCustomsOperation, opFor, operationAvailability, operationsFor, queryOpFor, recallOpFor, stageAfter, stageFromLegacy,
  CustomsStageSchema, type CustomsStage, type OperationAvailabilityInput,
} from "./customs-flow.js";
import { fillReason, REASON_CODES, REASON_TEXT_VI, reasonVi } from "./reason-codes.js";
import type { CustomsOperation } from "./dto/customs.js";

const base: OperationAvailabilityInput = { direction: "NK", stage: "NOT_SENT", approved: true, channel: null, hasContainers: true, pending: [], done: [] };
const avail = (over: Partial<OperationAvailabilityInput>) => Object.fromEntries(operationAvailability({ ...base, ...over }).map((r) => [r.op, r]));
const enabled = (over: Partial<OperationAvailabilityInput>) => operationAvailability({ ...base, ...over }).filter((r) => r.enabled).map((r) => r.op);

describe("mã nghiệp vụ theo chiều tờ khai", () => {
  it("nhập dùng I…, xuất dùng E…; tra cứu IID/IEX; AMA và nghiệp vụ cảng dùng chung", () => {
    expect(operationsFor("NK")).toEqual(["IDA", "IDB", "IDC", "IDD", "IDA01", "IDE", "AMA", "AMB", "AMC", "HYS", "CONT", "PORT_FEE"]);
    expect(operationsFor("XK")).toEqual(["EDA", "EDB", "EDC", "EDD", "EDA01", "EDE", "AMA", "AMB", "AMC", "HYS", "CONT", "PORT_FEE"]);
    expect([queryOpFor("NK"), queryOpFor("XK")]).toEqual(["IID", "IEX"]);
    expect([baseOp("EDA01"), baseOp("IEX"), baseOp("AMA"), opFor("XK", "HYS")]).toEqual(["IDA01", "IID", "AMA", "HYS"]);
  });
  it("mọi nghiệp vụ có nhãn tiếng Việt; mỗi nghiệp vụ của luồng thuộc đúng một giai đoạn", () => {
    for (const [op, d] of Object.entries(CUSTOMS_OPERATIONS)) expect(d.label.length, op).toBeGreaterThan(5);
    for (const op of operationsFor("NK")) expect(CUSTOMS_OPERATIONS[op].phase, op).not.toBeNull();
  });
});

describe("stageAfter – máy chuyển giai đoạn", () => {
  const path: [CustomsStage, CustomsOperation, CustomsStage][] = [
    ["NOT_SENT", "IDA", "PRE_DECLARED"], ["PRE_DECLARED", "IDB", "RECALLED"], ["RECALLED", "IDA", "PRE_DECLARED"], ["PRE_DECLARED", "IDC", "DECLARED"],
    ["DECLARED", "IDD", "AMEND_RECALLED"], ["AMEND_RECALLED", "IDA01", "AMEND_PRE_DECLARED"], ["AMEND_PRE_DECLARED", "IDD", "AMEND_RECALLED"], ["AMEND_PRE_DECLARED", "IDE", "DECLARED"],
    ["POST_EDITING", "AMA", "POST_PRE_DECLARED"], ["POST_PRE_DECLARED", "AMB", "POST_RECALLED"], ["POST_RECALLED", "AMA", "POST_PRE_DECLARED"], ["POST_PRE_DECLARED", "AMC", "CLEARED"],
    ["NOT_SENT", "EDA", "PRE_DECLARED"], ["PRE_DECLARED", "EDC", "DECLARED"], ["DECLARED", "EDD", "AMEND_RECALLED"],
  ];
  it.each(path)("%s --%s--> %s", (from, op, to) => expect(stageAfter(from, op)).toBe(to));
  it("cạnh không hợp lệ → null (không khai chính thức trước khai tạm, không IDB sau IDC, không AMA trước thông quan)", () => {
    expect(stageAfter("NOT_SENT", "IDC")).toBeNull();
    expect(stageAfter("DECLARED", "IDB")).toBeNull();
    expect(stageAfter("DECLARED", "AMA")).toBeNull();
    expect(stageAfter("CLEARED", "IDD")).toBeNull();
  });
  it("nghiệp vụ phụ / tra cứu giữ giai đoạn; chưa có số tờ khai thì không hợp lệ", () => {
    expect(stageAfter("DECLARED", "HYS")).toBe("DECLARED");
    expect(stageAfter("CLEARED", "PORT_FEE")).toBe("CLEARED");
    expect(stageAfter("NOT_SENT", "HYS")).toBeNull();
  });
  it("dữ liệu cũ: progress DOCS_SENT/DONE → DECLARED; state CLEARED/REJECTED thắng", () => {
    expect(stageFromLegacy("DOCS_SENT", "INSPECTION")).toBe("DECLARED");
    expect(stageFromLegacy("DONE", "CLEARED")).toBe("CLEARED");
    expect(stageFromLegacy("APPROVED", "APPROVED")).toBe("NOT_SENT");
    expect(stageFromLegacy("DONE", "REJECTED")).toBe("REJECTED");
    expect(stageFromLegacy(undefined, "PRE_DECLARED")).toBe("PRE_DECLARED");
    expect(stageFromLegacy(undefined, "INSPECTION")).toBe("DECLARED");
    expect(stageFromLegacy(undefined, "SEND_FAILED")).toBe("NOT_SENT");
  });
});

describe("operationAvailability – nút nào bấm được", () => {
  it("chưa khai: chỉ IDA; khai tạm xong: IDB, IDC, HYS, lệ phí cảng", () => {
    expect(enabled({ stage: "NOT_SENT" })).toEqual(["IDA"]);
    expect(enabled({ stage: "PRE_DECLARED" })).toEqual(["IDB", "IDC", "HYS", "PORT_FEE"]);
  });
  it("đã gọi sửa (RECALLED) mà chưa duyệt lại → IDA ở chế độ EDIT kèm hướng dẫn; duyệt lại → SEND", () => {
    expect(avail({ stage: "RECALLED", approved: false })["IDA"]).toMatchObject({ enabled: true, action: "EDIT", reason: expect.stringMatching(/Review/) });
    expect(avail({ stage: "RECALLED", approved: true })["IDA"]).toMatchObject({ enabled: true, action: "SEND" });
  });
  it("đã phân luồng: IDD, chứng từ, container, lệ phí; IDB/IDC khóa có lý do", () => {
    expect(enabled({ stage: "DECLARED", channel: "YELLOW" })).toEqual(["IDD", "HYS", "CONT", "PORT_FEE"]);
    expect(avail({ stage: "DECLARED" })["IDB"]).toMatchObject({ enabled: false, reason: expect.stringMatching(/chưa khai chính thức/) });
  });
  it("sửa đổi bổ sung: IDD → IDA01 (EDIT khi chưa duyệt) → IDE", () => {
    expect(avail({ stage: "AMEND_RECALLED", approved: false })["IDA01"]).toMatchObject({ action: "EDIT" });
    expect(enabled({ stage: "AMEND_PRE_DECLARED" })).toEqual(expect.arrayContaining(["IDD", "IDE"]));
  });
  it("đã thông quan: AMA là 'bắt đầu sửa sau thông quan'; IDD khóa", () => {
    expect(avail({ stage: "CLEARED" })["AMA"]).toMatchObject({ enabled: true, action: "START_POST_EDIT" });
    expect(avail({ stage: "CLEARED" })["IDD"]?.enabled).toBe(false);
    expect(enabled({ stage: "POST_PRE_DECLARED" })).toEqual(expect.arrayContaining(["AMB", "AMC"]));
  });
  it("đang chờ phản hồi một nghiệp vụ → mọi nút khóa, lý do nêu nghiệp vụ đang chờ", () => {
    const rows = operationAvailability({ ...base, stage: "PRE_DECLARED", pending: ["IDC"] });
    expect(rows.every((r) => !r.enabled)).toBe(true);
    expect(rows.find((r) => r.op === "IDB")?.reason).toMatch(/IDC/);
  });
  it("không có container → CONT khóa; tờ khai bị từ chối → mọi nút khóa", () => {
    expect(avail({ stage: "CLEARED", hasContainers: false })["CONT"]).toMatchObject({ enabled: false, reason: expect.stringMatching(/không có container/) });
    expect(operationAvailability({ ...base, stage: "REJECTED" }).some((r) => r.enabled)).toBe(false);
  });
  it("tờ khai xuất dùng mã E…", () => {
    expect(enabled({ direction: "XK", stage: "PRE_DECLARED" })).toEqual(["EDB", "EDC", "HYS", "PORT_FEE"]);
  });
});

describe("recallOpFor – nghiệp vụ gọi về đang bật của tờ", () => {
  const pick = (over: Partial<OperationAvailabilityInput>) => recallOpFor(operationAvailability({ ...base, ...over }));
  it("PRE_DECLARED → IDB/EDB; DECLARED, AMEND_PRE_DECLARED → IDD/EDD (kể cả khi tờ khai đang nháp)", () => {
    expect(pick({ stage: "PRE_DECLARED" })).toBe("IDB");
    expect(pick({ stage: "PRE_DECLARED", direction: "XK" })).toBe("EDB");
    expect(pick({ stage: "DECLARED", approved: false })).toBe("IDD");
    expect(pick({ stage: "AMEND_PRE_DECLARED", direction: "XK" })).toBe("EDD");
  });
  it("đang chờ phản hồi / giai đoạn không gọi về được → null (không bao giờ AMB)", () => {
    expect(pick({ stage: "PRE_DECLARED", pending: ["PORT_FEE"] })).toBeNull();
    for (const stage of ["NOT_SENT", "RECALLED", "AMEND_RECALLED", "CLEARED", "REJECTED", "POST_PRE_DECLARED"] as const) expect(pick({ stage })).toBeNull();
  });
});

describe("nextCustomsOperation – việc tiếp theo", () => {
  it.each([
    ["NOT_SENT", null, [], "IDA"], ["PRE_DECLARED", null, [], "IDC"], ["DECLARED", "YELLOW", [], "HYS"], ["DECLARED", "YELLOW", ["HYS"], null], ["DECLARED", "GREEN", [], null],
    ["AMEND_RECALLED", "RED", [], "IDA01"], ["AMEND_PRE_DECLARED", "RED", [], "IDE"], ["POST_EDITING", "GREEN", [], "AMA"], ["POST_PRE_DECLARED", "GREEN", [], "AMC"],
    ["CLEARED", "GREEN", [], "CONT"], ["CLEARED", "GREEN", ["CONT"], null],
  ] as const)("%s (luồng %s, đã làm %j) → %s", (stage, channel, done, expected) =>
    expect(nextCustomsOperation({ ...base, stage, channel, done: [...done] })).toBe(expected));
  it("đang chờ phản hồi → không gợi ý", () => expect(nextCustomsOperation({ ...base, pending: ["IDA"] })).toBeNull());
});

describe("mã lý do (reasonCode) – giao diện dịch theo mã, câu tiếng Việt giữ nguyên", () => {
  const combos: OperationAvailabilityInput[] = CustomsStageSchema.options.flatMap((stage) =>
    (["NK", "XK"] as const).flatMap((direction) =>
      [true, false].flatMap((approved) =>
        [true, false].flatMap((hasContainers) =>
          ([[], ["IDC"], ["IDA", "HYS"]] as CustomsOperation[][]).map((pending) => ({ ...base, stage, direction, approved, hasContainers, pending }))))));

  it("mọi dòng bị khóa / có lý do đều có mã, và câu = câu chuẩn của mã (reasonVi)", () => {
    for (const input of combos) {
      for (const r of operationAvailability(input)) {
        const where = `${input.direction} ${input.stage} ${r.op} pending=${input.pending.join(",")}`;
        if (!r.enabled) expect(r.reason, where).toBeTruthy();
        if (r.reason === undefined) {
          expect(r.reasonCode, where).toBeUndefined();
          continue;
        }
        expect(REASON_CODES, where).toContain(r.reasonCode);
        expect(r.reason, where).toBe(reasonVi(r.reasonCode!, r.reasonParams));
        expect(r.reason, where).not.toMatch(/\{\w+\}/);
      }
    }
  });
  it("giữ nguyên chữ tiếng Việt cũ", () => {
    expect(avail({ stage: "NOT_SENT" })["IDB"]).toMatchObject({ reasonCode: "IDB_REQUIRES_PRE_DECLARED", reason: "Chỉ gọi sửa khi đã khai tạm và chưa khai chính thức" });
    expect(avail({ stage: "PRE_DECLARED", pending: ["IDC", "HYS"] })["IDB"]).toMatchObject({
      reasonCode: "OPERATION_PENDING", reasonParams: { ops: "IDC, HYS" }, reason: "Đang chờ phản hồi IDC, HYS",
    });
    expect(avail({ stage: "RECALLED", approved: false })["IDA"]).toMatchObject({
      enabled: true, action: "EDIT", reasonCode: "EDIT_DECLARATION_FIRST", reason: "Sửa chỉ tiêu ở bước Review tờ khai và phê duyệt lại",
    });
    expect(avail({ stage: "REJECTED" })["HYS"]).toMatchObject({ reasonCode: "DECLARATION_REJECTED", reason: "Tờ khai đã bị Hải quan từ chối/hủy" });
    expect(avail({ stage: "DECLARED", hasContainers: false })["CONT"]).toMatchObject({ reasonCode: "NO_CONTAINERS", reason: "Lô hàng không có container" });
    expect(avail({ stage: "NOT_SENT" })["IDA"]).toEqual({ op: "IDA", enabled: true, action: "SEND" });
  });
  it("mọi mã đều có câu tiếng Việt; điền tham số", () => {
    for (const code of REASON_CODES) expect(REASON_TEXT_VI[code].trim()).not.toBe("");
    expect(reasonVi("HS_UNCONFIRMED", { n: 3 })).toBe("Còn 3 mã HS chưa xác nhận");
    expect(fillReason("Còn {n} {x}", { n: 1 })).toBe("Còn 1 {x}");
  });
});
