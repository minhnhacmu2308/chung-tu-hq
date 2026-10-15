# Hướng dẫn tích hợp API phân loại mã HS (HSCodePro)

Phiên bản: v1 · Cập nhật: 2026-10-15

API cho hệ thống khai báo gửi một invoice, nhận về cho từng dòng hàng:
**mã HS 8 số gợi ý, độ tin cậy, thuế NK (theo C/O), VAT và các mã thay thế**.
AI dùng chung bộ dữ liệu và công cụ với AI Xuất nhập khẩu của HSCodePro, và có
thể **hỏi lại người khai** khi mô tả hàng chưa đủ để chốt mã.

> API chỉ **gợi ý**. Mã HS 8 số trên tờ khai luôn do người khai xác nhận.

Mục lục:
1. Môi trường và xác thực
2. Luồng tích hợp
3. Các endpoint
4. JSON mẫu theo từng trạng thái (dùng để mock khi chưa có server)
5. Gắn vào màn hình "Xác nhận mã HS"
6. Hiển thị câu hỏi của AI và gửi câu trả lời
7. Code mẫu (TypeScript / Node 18+)
8. Xử lý lỗi
9. Bảng `co_form`
10. Checklist tích hợp và test

---

## 1. Môi trường và xác thực

| | Giá trị |
|---|---|
| Base URL (dev) | `https://dev.aixuatnhapkhau.cloud` |
| Tiền tố API | `/internal/v1/hs-classifications` |
| Định dạng | JSON, UTF-8 |
| Xác thực | Header `X-Internal-Api-Key: <khoá>` |

- Khoá do HSCodePro cấp riêng, **chỉ gọi từ máy chủ** của hệ thống khai báo.
  Không đặt khoá trong code trình duyệt hay app di động.
- Hạn mức: **600 request/phút** cho mọi lời gọi, **20 lần tạo lượt/phút**. Vượt
  thì nhận `429` kèm header `Retry-After` (giây).

## 2. Luồng tích hợp

```
Hệ thống khai báo                          HSCodePro
  │ 1. POST /internal/v1/hs-classifications  (invoice nhiều dòng)
  │ ─────────────────────────────────────▶   202 { id, status: "processing", items[...] }
  │
  │ 2. GET /internal/v1/hs-classifications/{id}   mỗi 3 giây
  │ ─────────────────────────────────────▶   status "processing" → gọi tiếp
  │                                          status "need_info"  → có dòng cần hỏi người khai
  │                                          status "completed"  → xong, hiện kết quả
  │
  │ 3. (nếu need_info) hiện câu hỏi, người khai trả lời
  │    POST /internal/v1/hs-classifications/{id}/items/{itemId}/answers
  │ ─────────────────────────────────────▶   202 → quay lại bước 2
  │
  │ 4. Người khai bấm Xác nhận / Đổi / Bỏ trên màn hình của bạn (không gọi API)
```

**Trạng thái của từng dòng hàng** (`items[].status`):

| Trạng thái | Ý nghĩa | Hiển thị gợi ý |
|---|---|---|
| `queued` | Đang chờ tới lượt | "Đang chờ…" |
| `processing` | AI đang phân tích (thường 20–90 giây) | spinner "Đang phân loại…" |
| `need_info` | AI cần người khai bổ sung thông tin | nút "Trả lời AI" / badge "Cần bổ sung" |
| `completed` | Có kết quả | mã gợi ý, độ tin cậy, thuế |
| `failed` | AI lỗi | thông báo lỗi + nút "Phân loại lại" |
| `cancelled` | Đã huỷ hoặc câu hỏi quá 24 giờ không trả lời | "Đã huỷ" + nút "Phân loại lại" |

**Trạng thái của cả lượt** (`status` ở gốc) — suy ra từ các dòng:
- còn dòng `need_info` → `need_info`
- còn dòng `queued`/`processing` → `processing`
- còn lại → `completed` (kể cả khi có dòng `failed`/`cancelled` — xem lỗi ở từng dòng)

**Nhịp polling:** gọi `GET` khoảng **3 giây/lần** khi lượt đang `processing`.
Khi `need_info`, có thể giãn ra (hoặc dừng) cho tới khi người khai trả lời xong,
rồi polling lại. Khi `completed`, dừng hẳn.

Các dòng chạy song song và độc lập: dòng 1 đang chờ trả lời không chặn dòng 2, 3.
Nên **cập nhật giao diện theo từng dòng** mỗi lần polling, đừng đợi cả lượt xong.

## 3. Các endpoint

### 3.1 `POST /internal/v1/hs-classifications` — tạo lượt phân loại

Body:

| Trường | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `external_ref` | string | không | ≤ 100 ký tự. Mã invoice/tờ khai bên bạn, để đối chiếu |
| `import_date` | `YYYY-MM-DD` | không | Ngày dự kiến đăng ký tờ khai. Mặc định: hôm nay (giờ VN). Thuế FTA tính theo ngày này |
| `items` | mảng | **có** | 1–50 dòng |
| `items[].line_no` | số nguyên ≥ 1 | **có** | Số thứ tự dòng, không trùng trong cùng request |
| `items[].description` | string | **có** | 3–1000 ký tự. Ghi càng rõ (tên hàng, model, vật liệu, công dụng, kích thước) thì AI càng ít phải hỏi lại |
| `items[].origin_country` | string | **có** | Mã nước ISO 3166-1 alpha-2: `TW`, `CN`, `JP`, `KR`, `DE`… |
| `items[].quantity` | number ≥ 0 | không | |
| `items[].unit` | string | không | ≤ 20 ký tự, vd `PCE`, `SET`, `KGM` |
| `items[].value_usd` | number ≥ 0 | không | Trị giá dòng hàng |
| `items[].invoice_hs` | string | không | Mã HS ghi trên invoice nước ngoài. Chỉ 6 số đầu được dùng làm tham khảo |
| `items[].co_form` | string \| null | không | Loại C/O (xem mục 9). `null` hoặc bỏ trống = không có C/O → thuế MFN |

```json
{
  "external_ref": "INV-2026-00123",
  "import_date": "2026-10-15",
  "items": [
    { "line_no": 1, "description": "Thanh trượt dẫn hướng MGN12H, dài 500 mm", "quantity": 100, "unit": "PCE", "origin_country": "TW", "value_usd": 2840.00, "invoice_hs": "8466.93", "co_form": null },
    { "line_no": 2, "description": "Vít me bi SFU1605, dài 600 mm", "quantity": 40, "unit": "PCE", "origin_country": "TW", "value_usd": 2180.00, "invoice_hs": "8483.40", "co_form": null },
    { "line_no": 3, "description": "Gối đỡ vít me BK12/BF12 (không lắp ổ bi)", "quantity": 50, "unit": "SET", "origin_country": "TW", "value_usd": 600.00, "co_form": null }
  ]
}
```

Trả về **`202`** với nội dung giống `GET` (mục 3.2), mọi dòng ở `queued`.
**Lưu lại `id` của lượt và `id` của từng dòng** (map theo `line_no`).

### 3.2 `GET /internal/v1/hs-classifications/{id}` — xem trạng thái

Trả `200`. Cấu trúc:

```ts
type Job = {
  id: string;
  external_ref: string | null;
  import_date: string;              // YYYY-MM-DD
  status: 'processing' | 'need_info' | 'completed';
  created_at: string;               // ISO 8601
  items: Item[];                    // sắp theo line_no
};

type Item = {
  id: string;
  line_no: number;
  status: 'queued' | 'processing' | 'need_info' | 'completed' | 'failed' | 'cancelled';
  question: PendingQuestion | null; // chỉ có khi status = need_info
  result: Result | null;            // chỉ có khi status = completed
  error: { code: string; message: string } | null;
};

type PendingQuestion = {
  id: string;                       // gửi lại trong question_id khi trả lời
  questions: Question[];            // 1–3 câu hỏi con
};

type Question = {
  id: string;
  question: string;                 // câu hỏi, tiếng Việt
  header?: string;                  // tiêu đề ngắn (nếu có)
  detail?: string;                  // giải thích thêm (nếu có)
  options?: { label: string; description?: string }[];
  multiSelect?: boolean;            // true = chọn nhiều
};

type Result = {
  hs_code: string;                  // 8 chữ số, không dấu chấm: "84834090"
  hs_description: string;           // mô tả dòng mã trong biểu thuế
  confidence: number;               // 0–100
  reasoning: string;                // lý do chọn mã (tiếng Việt)
  legal_basis: string[];            // chú giải, quy tắc, số thông báo PTPL…
  warnings: string[];               // điều người khai cần kiểm tra lại
  tax: Tax | null;                  // null nếu tạm thời không tra được
  alternatives: Alternative[];      // tối đa 3
};

type Alternative = {
  hs_code: string;
  hs_description: string;
  confidence: number;
  why_not: string;                  // vì sao AI không chọn mã này
  tax: Tax | null;
};

type Tax = {
  import: {
    rate: number;                   // % thuế nhập khẩu
    basis: 'MFN' | 'FTA';           // MFN = ưu đãi; FTA = ưu đãi đặc biệt theo C/O
    agreement: string | null;       // mã hiệp định khi basis = FTA, vd "ACFTA"
  };
  vat: { rate: number | null; note: string | null };
  source_date: string;              // ngày dùng để tra thuế (YYYY-MM-DD)
};
```

### 3.3 `POST /internal/v1/hs-classifications/{id}/items/{itemId}/answers` — trả lời câu hỏi

```json
{
  "question_id": "5b0c2f3e-…",
  "answers": [
    { "id": "material", "selected": ["Thép"], "custom": null },
    { "id": "bearing", "selected": [], "custom": "Không kèm ổ bi, chỉ có thân gối" }
  ]
}
```

- `question_id` = `items[].question.id`.
- Mỗi câu hỏi con trong `questions` cần **một** phần tử trong `answers`, cùng `id`.
- `selected`: các `label` người khai đã chọn (mảng rỗng nếu người khai tự gõ).
- `custom`: câu trả lời tự nhập, hoặc `null`.
- Mỗi phần tử phải có ít nhất một lựa chọn hoặc `custom`.

Trả **`202`** `{ "accepted": true }`. Dòng chuyển về `queued` → `processing`;
tiếp tục polling.

### 3.4 `POST /internal/v1/hs-classifications/{id}/cancel` — huỷ lượt

Không cần body. Trả **`202`** `{ "accepted": true, "cancelled": 2 }` (số dòng bị
huỷ). Dòng đã `completed`/`failed` giữ nguyên. Dùng khi người khai huỷ tờ khai
hoặc gửi lại invoice khác.

> **Phân loại lại một dòng** (sau `failed`/`cancelled`, hoặc khi người khai sửa
> mô tả): tạo một lượt mới chỉ chứa dòng đó. API không có endpoint chạy lại.

## 4. JSON mẫu theo từng trạng thái

Dùng các mẫu này để dựng giao diện và mock trước khi server sẵn sàng.

**4.1 Vừa tạo (`POST` trả về)**

```json
{
  "id": "7d1e9a52-3c4b-4f0e-9b61-2a8c5d7e1f00",
  "external_ref": "INV-2026-00123",
  "import_date": "2026-10-15",
  "status": "processing",
  "created_at": "2026-10-14T17:10:30.000Z",
  "items": [
    { "id": "a1b2c3d4-0001-4000-8000-000000000001", "line_no": 1, "status": "queued", "question": null, "result": null, "error": null },
    { "id": "a1b2c3d4-0002-4000-8000-000000000002", "line_no": 2, "status": "queued", "question": null, "result": null, "error": null },
    { "id": "a1b2c3d4-0003-4000-8000-000000000003", "line_no": 3, "status": "queued", "question": null, "result": null, "error": null }
  ]
}
```

**4.2 Một dòng cần bổ sung thông tin, một dòng xong, một dòng đang chạy**

```json
{
  "id": "7d1e9a52-3c4b-4f0e-9b61-2a8c5d7e1f00",
  "external_ref": "INV-2026-00123",
  "import_date": "2026-10-15",
  "status": "need_info",
  "created_at": "2026-10-14T17:10:30.000Z",
  "items": [
    {
      "id": "a1b2c3d4-0001-4000-8000-000000000001",
      "line_no": 1,
      "status": "need_info",
      "question": {
        "id": "5b0c2f3e-8d7a-4c1b-9e2f-1a2b3c4d5e6f",
        "questions": [
          {
            "id": "use",
            "header": "Công dụng",
            "question": "Thanh trượt này dùng cho loại máy nào?",
            "options": [
              { "label": "Máy công cụ (CNC, máy phay, máy tiện)" },
              { "label": "Máy in 3D / thiết bị tự động hoá nhẹ" },
              { "label": "Khác", "description": "Ghi rõ ở ô trả lời khác" }
            ],
            "multiSelect": false
          }
        ]
      },
      "result": null,
      "error": null
    },
    {
      "id": "a1b2c3d4-0002-4000-8000-000000000002",
      "line_no": 2,
      "status": "completed",
      "question": null,
      "result": {
        "hs_code": "84834090",
        "hs_description": "Loại khác",
        "confidence": 83,
        "reasoning": "Vít me bi là cơ cấu biến chuyển động quay thành chuyển động tịnh tiến, thuộc nhóm 84.83 (vít bi hoặc vít đũa).",
        "legal_basis": ["Chú giải 2 Phần XVI", "Quy tắc tổng quát 1 và 6"],
        "warnings": [],
        "tax": {
          "import": { "rate": 5, "basis": "MFN", "agreement": null },
          "vat": { "rate": 10, "note": null },
          "source_date": "2026-10-15"
        },
        "alternatives": [
          {
            "hs_code": "84669390",
            "hs_description": "Loại khác",
            "confidence": 12,
            "why_not": "Chỉ đúng khi là bộ phận chuyên dùng riêng cho máy công cụ nhóm 84.56–84.61",
            "tax": {
              "import": { "rate": 0, "basis": "MFN", "agreement": null },
              "vat": { "rate": 10, "note": null },
              "source_date": "2026-10-15"
            }
          }
        ]
      },
      "error": null
    },
    { "id": "a1b2c3d4-0003-4000-8000-000000000003", "line_no": 3, "status": "processing", "question": null, "result": null, "error": null }
  ]
}
```

**4.3 Dòng lỗi**

```json
{
  "id": "a1b2c3d4-0003-4000-8000-000000000003",
  "line_no": 3,
  "status": "failed",
  "question": null,
  "result": null,
  "error": { "code": "TIMEOUT", "message": "AI xử lý quá 10 phút." }
}
```

**4.4 Có kết quả nhưng chưa tra được thuế**

```json
{
  "hs_code": "84833090",
  "hs_description": "Loại khác",
  "confidence": 74,
  "reasoning": "Gối đỡ trục không lắp ổ bi thuộc phân nhóm 8483.30.",
  "legal_basis": [],
  "warnings": ["Chưa tra được thuế cho mã này, vui lòng kiểm tra lại trước khi khai."],
  "tax": null,
  "alternatives": []
}
```

## 5. Gắn vào màn hình "Xác nhận mã HS"

| Cột trên màn hình | Lấy từ |
|---|---|
| Mô tả hàng, số lượng, xuất xứ, trị giá, HS trên invoice | dữ liệu bên bạn gửi đi |
| **Gợi ý hscodepro** | `result.hs_code` → hiển thị dạng `8483.40.90` (chèn dấu chấm sau số thứ 4 và thứ 6) |
| Thanh % dưới mã gợi ý | `result.confidence` |
| **Thuế NK · VAT** | `result.tax.import.rate` · `result.tax.vat.rate`. Nếu `basis = "FTA"` nên ghi kèm hiệp định, vd `0% (ACFTA) · 10%`. `tax = null` → hiện `—` |
| **Xác nhận** (mặc định) | `result.hs_code` |
| **Đổi** | danh sách `result.alternatives` (mỗi mã có sẵn `tax`, `confidence`, `why_not`), cho phép người khai nhập tay mã khác |
| **Bỏ** | xử lý phía bạn, không gọi API |
| Tooltip / chi tiết dòng | `result.reasoning`, `result.legal_basis`, `result.warnings` |

Gợi ý hiển thị:
- `confidence < 60` hoặc `warnings` không rỗng → tô màu cảnh báo, khuyến khích
  người khai kiểm tra kỹ.
- Hiển thị `warnings` cạnh mã, đừng giấu trong tooltip.
- VAT là đúng số trong biểu thuế VNACCS; API **không** tự áp mức giảm VAT theo
  nghị định (vd 10% → 8%). Nếu bên bạn có quy tắc giảm VAT, áp ở phía bạn.

```ts
const formatHs = (code: string) => `${code.slice(0, 4)}.${code.slice(4, 6)}.${code.slice(6)}`;
// "84834090" → "8483.40.90"
```

## 6. Hiển thị câu hỏi của AI và gửi câu trả lời

Với mỗi dòng `need_info`, hiển thị `question.questions` (1–3 câu):

- Có `options` và `multiSelect: false` → radio; `multiSelect: true` → checkbox.
- **Luôn có thêm ô "Trả lời khác"** (gửi vào `custom`), kể cả khi có `options`.
- Không có `options` → chỉ ô nhập tự do.
- `header` (nếu có) làm nhãn ngắn, `detail` (nếu có) làm dòng giải thích.

Sau khi gửi `answers` thành công (`202`), đổi dòng sang trạng thái "Đang phân
loại…" và polling lại. AI sẽ **không hỏi lại** những gì người khai đã trả lời,
nhưng có thể hỏi thêm câu mới nếu vẫn còn thiếu thông tin.

Câu hỏi không được trả lời trong **24 giờ** thì dòng tự chuyển `cancelled` với
`error.code = "QUESTION_EXPIRED"`.

## 7. Code mẫu (TypeScript / Node 18+)

```ts
const BASE_URL = process.env.HSCODEPRO_URL!;          // https://dev.aixuatnhapkhau.cloud
const API_KEY = process.env.HSCODEPRO_INTERNAL_KEY!;
const PREFIX = '/internal/v1/hs-classifications';

class HsApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const res = await fetch(`${BASE_URL}${PREFIX}${path}`, {
      method,
      headers: { 'X-Internal-Api-Key': API_KEY, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    if (res.status === 429) {
      const wait = Number(res.headers.get('Retry-After') || 5);
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new HsApiError(res.status, data.code, data.error, data.details);
    return data as T;
  }
  throw new HsApiError(429, 'RATE_LIMITED', 'Gọi quá nhanh, đã thử lại 3 lần.');
}

export const createJob = (payload: unknown) => call<Job>('POST', '', payload);
export const getJob = (jobId: string) => call<Job>('GET', `/${jobId}`);
export const answer = (jobId: string, itemId: string, questionId: string, answers: unknown[]) =>
  call<{ accepted: true }>('POST', `/${jobId}/items/${itemId}/answers`, { question_id: questionId, answers });
export const cancelJob = (jobId: string) => call<{ accepted: true; cancelled: number }>('POST', `/${jobId}/cancel`);

/**
 * Polling tới khi lượt không còn "processing". Gọi onUpdate mỗi lần để giao diện
 * cập nhật theo từng dòng.
 */
export async function pollUntilSettled(jobId: string, onUpdate: (job: Job) => void, intervalMs = 3000) {
  for (;;) {
    const job = await getJob(jobId);
    onUpdate(job);
    if (job.status !== 'processing') return job;   // need_info hoặc completed
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

// Ví dụ dùng:
// const job = await createJob({ external_ref: 'INV-1', items: [...] });
// let state = await pollUntilSettled(job.id, render);
// while (state.status === 'need_info') {
//   for (const item of state.items.filter((i) => i.status === 'need_info')) {
//     const answers = await askUser(item.question!);   // giao diện của bạn
//     await answer(state.id, item.id, item.question!.id, answers);
//   }
//   state = await pollUntilSettled(state.id, render);
// }
```

> Nếu giao diện của bạn để người khai trả lời bất đồng bộ (không chờ trong một
> request), lưu `job.id` vào tờ khai và gọi `getJob` khi người khai mở lại màn hình.

## 8. Xử lý lỗi

Lỗi request trả về: `{ "error": "<thông điệp tiếng Việt>", "code": "<MÃ>" }`
(riêng `400` có thêm `details`).

| HTTP | `code` | Nguyên nhân | Nên làm |
|---|---|---|---|
| 400 | `INVALID_INPUT` | Sai dữ liệu. `details: [{ field, message }]`, vd `field: "items[1].origin_country"` | Sửa dữ liệu, không thử lại nguyên trạng |
| 401 | `UNAUTHORIZED` | Thiếu/sai khoá | Kiểm tra cấu hình khoá |
| 404 | `NOT_FOUND` | Sai `id` lượt hoặc dòng | |
| 409 | `INVALID_STATE` | Trả lời khi dòng không còn chờ câu hỏi đó (thường do bấm gửi hai lần) | Gọi lại `GET` rồi hiển thị theo trạng thái mới |
| 429 | `RATE_LIMITED` | Gọi quá nhanh | Chờ theo `Retry-After` |
| 500 | `INTERNAL_ERROR` | Lỗi hệ thống | Thử lại sau |
| 503 | `NOT_CONFIGURED` | Máy chủ HSCodePro chưa bật API | Liên hệ HSCodePro |

Lỗi trên từng dòng (`items[].error.code`):

| `code` | Ý nghĩa | Nên làm |
|---|---|---|
| `AGENT_FAILED` | AI gặp lỗi khi phân loại | Nút "Phân loại lại" (tạo lượt mới cho dòng đó) |
| `INVALID_AGENT_OUTPUT` | AI không trả kết luận hợp lệ | Như trên; nên bổ sung mô tả |
| `TIMEOUT` | Một lần chạy quá 10 phút | Như trên |
| `QUESTION_EXPIRED` | Câu hỏi quá 24 giờ không trả lời | Như trên |

## 9. Bảng `co_form`

Không phân biệt hoa thường. Giá trị ngoài bảng → `400`.

| `co_form` | Hiệp định |
|---|---|
| `D` | ATIGA (ASEAN) |
| `E` | ACFTA (ASEAN – Trung Quốc) |
| `AK` | AKFTA (ASEAN – Hàn Quốc) |
| `AANZ` | AANZFTA (ASEAN – Úc – New Zealand) |
| `AI` | AIFTA (ASEAN – Ấn Độ) |
| `AJ` | AJCEP (ASEAN – Nhật Bản) |
| `VJ` | VJEPA (Việt Nam – Nhật Bản) |
| `VC` | VCFTA (Việt Nam – Chile) |
| `VK` | VKFTA (Việt Nam – Hàn Quốc) |
| `EAV` | VN_EAEU_FTA (Việt Nam – Liên minh Kinh tế Á – Âu) |
| `EUR.1` | EVFTA (Việt Nam – EU) |
| `EUR.1-UK` | UKVFTA (Việt Nam – Anh) |
| `CPTPP` | CPTPP |
| `VI` | VIFTA (Việt Nam – Israel) |
| `CEPA` | CEPA_VN_UAE (Việt Nam – UAE) |

- Có `co_form` mà biểu FTA không có mã đó, hoặc nước xuất xứ bị loại trừ khỏi
  hiệp định → API áp thuế **MFN** và ghi lý do vào `warnings`.
- Có thuế FTA **không** đồng nghĩa lô hàng đủ điều kiện ưu đãi: người khai vẫn
  phải kiểm tra C/O và quy tắc xuất xứ.

## 10. Checklist tích hợp và test

**Làm trước (chưa cần server)** — dựng theo JSON mẫu ở mục 4:
- [ ] Client gọi API phía máy chủ, khoá đọc từ biến môi trường.
- [ ] Map `items[].id` ↔ `line_no` sau khi tạo lượt.
- [ ] Polling 3 giây, cập nhật giao diện **theo từng dòng**, dừng khi `completed`.
- [ ] Hiển thị đủ 6 trạng thái dòng (mục 2).
- [ ] Cột gợi ý: định dạng `xxxx.xx.xx`, thanh `confidence`, thuế NK · VAT, `—` khi `tax = null`.
- [ ] Nút "Đổi" hiện `alternatives` kèm thuế và `why_not`, cho nhập tay mã khác.
- [ ] Màn hình trả lời câu hỏi: radio/checkbox theo `multiSelect` + ô "Trả lời khác".
- [ ] Xử lý `409` (gọi lại `GET`), `429` (chờ `Retry-After`), `400` (hiện lỗi theo `details`).
- [ ] Nút "Phân loại lại" cho dòng `failed`/`cancelled` (tạo lượt mới 1 dòng).
- [ ] Người khai luôn phải bấm xác nhận mã cuối cùng.

**Test khi HSCodePro báo đã deploy** (nhận khoá thật):
1. `GET {BASE_URL}/internal/v1/hs-classifications/khong-ton-tai` với khoá đúng → `404 NOT_FOUND`
   (chứng tỏ khoá và đường dẫn đúng). Khoá sai → `401`.
2. Gửi invoice 3 dòng mẫu ở mục 3.1 → `202`, sau 1–3 phút cả 3 dòng `completed`
   hoặc có dòng `need_info`.
3. Trả lời một câu hỏi → dòng về `processing` rồi `completed`, AI không hỏi lại câu cũ.
4. Gửi `co_form: "E"` với `origin_country: "CN"` → `tax.import.basis` là `FTA` (hoặc `MFN` kèm cảnh báo nếu mã không có trong biểu ACFTA).
5. Gửi `origin_country: "TWN"` → `400` có `details[].field = "items[0].origin_country"`.
6. Tạo lượt rồi gọi `cancel` ngay → các dòng chưa xong thành `cancelled`.

Thử nhanh bằng `curl`:

```bash
export HSCODEPRO_URL=https://dev.aixuatnhapkhau.cloud
export KEY=<khoá được cấp>

# Tạo lượt
curl -s -X POST "$HSCODEPRO_URL/internal/v1/hs-classifications" \
  -H "X-Internal-Api-Key: $KEY" -H 'Content-Type: application/json' \
  -d '{"items":[{"line_no":1,"description":"Vít me bi SFU1605, dài 600 mm","origin_country":"TW","invoice_hs":"8483.40"}]}'

# Xem trạng thái (thay JOB_ID)
curl -s "$HSCODEPRO_URL/internal/v1/hs-classifications/JOB_ID" -H "X-Internal-Api-Key: $KEY"

# Trả lời câu hỏi (thay JOB_ID, ITEM_ID, QUESTION_ID, id câu hỏi con)
curl -s -X POST "$HSCODEPRO_URL/internal/v1/hs-classifications/JOB_ID/items/ITEM_ID/answers" \
  -H "X-Internal-Api-Key: $KEY" -H 'Content-Type: application/json' \
  -d '{"question_id":"QUESTION_ID","answers":[{"id":"use","selected":["Máy công cụ (CNC, máy phay, máy tiện)"],"custom":null}]}'
```

Liên hệ HSCodePro khi: nhận `503`, tỷ lệ `failed` cao bất thường, hoặc mã gợi ý
sai hệ thống ở một nhóm hàng (gửi kèm `id` lượt để tra log).
