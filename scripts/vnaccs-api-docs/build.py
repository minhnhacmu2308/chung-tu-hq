#!/usr/bin/env python3
"""Sinh tài liệu API FPT.VNACCS: docs/vnaccs-api/{README.md, index.html, data.json, samples/*.json}.

Ghép: Postman FPT (body mẫu từng API) + Excel đặc tả (TAI LIEU TICH HOP VNACCS) + mẫu phản hồi thật (apps/fpt-mock/src/fixtures)
+ mô tả nghiệp vụ viết tay (ops.py). Mật khẩu / terminal key / token được che, base64 dài được cắt.

  python3 scripts/vnaccs-api-docs/build.py \
    --postman "~/Downloads/API-VNACCS NEW.postman_collection_21042026.json" \
    --xlsx "TAI LIEU TICH HOP VNACCS"
"""
import argparse, glob, html, json, os, re, sys
from pathlib import Path

import openpyxl

sys.path.insert(0, str(Path(__file__).parent))
from ops import ACCOUNT, CONFLICTS, DECISIONS, FLOWS, GAPS, GROUPS, MESSAGE_TABLES, OPS, SOURCE_PRIORITY  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "docs" / "vnaccs-api"
FIXTURES = ROOT / "apps" / "fpt-mock" / "src" / "fixtures"
# Bí mật + mã tài khoản VNACCS/FPT (mẫu lấy từ tài khoản thật) – thay bằng *** trong tài liệu.
SECRET_KEYS = {"password", "terminal_access_key", "token", "user_id", "terminal_id", "username", "user_code"}


def json_key(name: str) -> str:
    """Tên chỉ tiêu Excel → key JSON như FPT gửi (camelCase kiểu .NET: TK_ECN → tK_ECN, USER_ID → useR_ID)."""
    c = list(name)
    for i in range(len(c)):
        if i == 1 and not c[i].isupper():
            break
        has_next = i + 1 < len(c)
        if i > 0 and has_next and not c[i + 1].isupper():
            break
        c[i] = c[i].lower()
    return "".join(c)


def redact(o):
    if isinstance(o, dict):
        return {k: ("***" if k.lower() in SECRET_KEYS and isinstance(v, str) and v else redact(v)) for k, v in o.items()}
    if isinstance(o, list):
        return [redact(x) for x in o]
    return o


def trunc(o, keep_list=3):
    if isinstance(o, dict):
        return {k: trunc(v, keep_list) for k, v in o.items()}
    if isinstance(o, list):
        return [trunc(x, keep_list) for x in o[:keep_list]] + ([f"… còn {len(o) - keep_list} phần tử"] if len(o) > keep_list else [])
    if isinstance(o, str) and len(o) > 160:
        return o[:40] + f"…(base64/chuỗi dài {len(o)} ký tự)"
    return o


# ───────────────────────── Excel ─────────────────────────
def load_xlsx(folder: Path):
    out = {}
    for f in sorted(glob.glob(str(folder / "*.xlsx"))):
        wb = openpyxl.load_workbook(f, read_only=True, data_only=True)
        sheets = {}
        for ws in wb.worksheets:
            rows = [["" if v is None else str(v).strip() for v in r] for r in ws.iter_rows(values_only=True)]
            sheets[ws.title] = [r for r in rows if any(r)]
        out[os.path.basename(f)] = sheets
    return out


HEAD_MAP = {
    "name": "name", "chỉ tiêu": "name", "data_property_name": "name",
    "type": "type", "dữ liệu": "type", "attribute": "type",
    "size": "size", "figure": "size",
    "required": "required", "bắt buộc": "required",
    "request": "req", "response": "res",
    "ghi chú": "note", "category": "note", "refer": "note", "refer table": "note", "level": "level", "expeditors": "note", "date_time": "note",
}
FIELD_NAME = re.compile(r"^[A-Za-z][A-Za-z0-9_]*$")


def parse_table(rows):
    """Bảng trường của một sheet (định dạng header khác nhau giữa các file FPT) → danh sách trường + phần ghi chú/danh mục kèm theo."""
    hi = None
    for i, r in enumerate(rows[:8]):
        first = next((c for c in r if c), "")
        if first in ("Name", "Chỉ tiêu", "STT"):
            hi = i
            break
    if hi is None:
        return None
    head = rows[hi]
    cols = {}
    desc_seen = 0
    stt_sheet = next((c for c in head if c), "") == "STT"
    for j, h in enumerate(head):
        k = h.strip().lower()
        if not k:
            continue
        if k in ("description", "mô tả") or (stt_sheet and k == "name"):
            cols.setdefault("desc" if desc_seen == 0 else "descEn", j)
            desc_seen += 1
        elif k in HEAD_MAP:
            key = HEAD_MAP[k]
            if key == "note" and "note" in cols:
                cols.setdefault("note2", j)
            else:
                cols.setdefault(key, j)
    fields, extra = [], []
    for r in rows[hi + 1:]:
        get = lambda k: r[cols[k]] if k in cols and cols[k] < len(r) else ""  # noqa: E731
        name = get("name")
        if name and FIELD_NAME.match(name) and not extra:
            f = {"name": name, "json": json_key(name), "type": get("type"), "size": get("size"), "desc": get("desc"),
                 "descEn": get("descEn"), "required": bool(get("required")), "req": bool(get("req")), "res": bool(get("res")),
                 "note": " · ".join(x for x in (get("note"), get("note2")) if x), "level": get("level")}
            fields.append(f)
        else:
            vals = [c for c in r if c]
            if vals:
                extra.append(vals)
    has_rr = "req" in cols or "res" in cols
    return {"fields": fields, "extra": extra, "hasReqRes": has_rr, "hasLevel": "level" in cols}


def rep_codes(x):
    """REP_VNACCS: cột B = nghiệp vụ (để trống → thuộc nghiệp vụ dòng trên), C mã thông điệp, D tên, E loại C/P, F khối phản hồi."""
    rows = x["REP_VNACCS V1.1.xlsx"]["Sheet1"]
    out, op = [], None
    for r in rows[1:]:
        r = (r + [""] * 6)[:6]
        if not r[2]:
            continue
        op = r[1] or op
        out.append({"op": op, "code": r[2].strip(), "name": " ".join(r[3].split()), "type": r[4].strip(), "response": r[5].strip()})
    return out


# ───────────────────────── Postman ─────────────────────────
def load_postman(path: Path):
    c = json.load(open(path))
    ops = {}
    for it in c["item"]:
        r = it["request"]
        url = r["url"]["raw"] if isinstance(r["url"], dict) else r["url"]
        op = url.rstrip("/").split("/")[-1]
        if op == "login":
            op = "login"
        body_raw = (r.get("body") or {}).get("raw", "") or ""
        body = json.loads(body_raw) if body_raw.strip() else None
        auth = (r.get("auth") or {}).get("type")
        ops[op] = {"url": url, "method": r.get("method", "POST"), "auth": auth, "body": body}
    return ops


def build(args):
    x = load_xlsx(Path(args.xlsx))
    pm = load_postman(Path(os.path.expanduser(args.postman)))
    rep = rep_codes(x)
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "samples").mkdir(exist_ok=True)

    tables = {}

    def table(file, sheet):
        key = f"{file}::{sheet}"
        if key not in tables:
            t = parse_table(x[file][sheet])
            if t is None:
                raise SystemExit(f"Không đọc được bảng {key}")
            t["file"], t["sheet"] = file, sheet
            tables[key] = t
        return key

    ops_out = []
    for op_id, meta in OPS.items():
        p = pm.get(op_id)
        if meta.get("postman", True) and p is None:
            print(f"! {op_id} không có trong Postman", file=sys.stderr)
        sample = None
        if p and p["body"] is not None:
            sample = trunc(redact(p["body"]))
            json.dump(trunc(redact(p["body"]), keep_list=10_000), open(OUT / "samples" / f"{op_id}.request.json", "w"), ensure_ascii=False, indent=2)
        field_groups = []
        if meta.get("fields") == "CATALOG":
            for sheet in x["DANH MUC CHUAN VNACCS.xlsx"]:
                if sheet.startswith("VN_"):
                    title = next((c for c in x["DANH MUC CHUAN VNACCS.xlsx"][sheet][0] if c), sheet)
                    field_groups.append({"label": f"{sheet} – {title}", "table": table("DANH MUC CHUAN VNACCS.xlsx", sheet), "kind": "res"})
        else:
            for label, f, s, kind in meta.get("fields", []):
                field_groups.append({"label": label, "table": table(f, s), "kind": kind})
        codes = [r for r in rep if r["op"] == meta.get("code")] if meta.get("code") else []
        real = None
        if meta.get("real_response"):
            real = trunc(redact(json.load(open(FIXTURES / f"{meta['real_response']}.json"))), keep_list=2)
        base = "{{FPT_BASE_URL}}"
        path = "/api/auth/login" if op_id == "login" else f"/api/{op_id}"
        ops_out.append({
            "id": op_id, **{k: v for k, v in meta.items() if k not in ("fields",)},
            "endpoint": {"method": (p or {}).get("method", "POST"), "path": path, "base": base, "postmanUrl": (p or {}).get("url"),
                         "auth": "Không" if op_id == "login" else "Bearer token (từ /api/auth/login)"},
            "inPostman": p is not None,
            "sample": sample,
            "hasAccount": isinstance((p or {}).get("body"), dict) and ACCOUNT in p["body"],
            "fieldGroups": field_groups,
            "repCodes": codes,
            "realResponse": real,
        })

    # Mẫu lỗi thật
    errors = []
    for f, title in [("eda-response-wrong-password", "A0004 – sai mật khẩu VNACCS (FPT trả trùng 2 lần)"), ("eda-response-past-departure", "S1139 – ngày hàng đi trước ngày khai")]:
        d = json.load(open(FIXTURES / f"{f}.json"))
        errors.append({"title": title, "errorList": d.get("errorList")})
    envelope_keys = list(json.load(open(FIXTURES / "eda-response-success.json")).keys())
    msg_tables = [{"key": k, "title": t, "table": table(f, s)} for k, t, f, s in MESSAGE_TABLES]

    data = {
        "generatedFrom": {"postman": os.path.basename(args.postman), "xlsx": sorted(x.keys())},
        "groups": GROUPS, "flows": FLOWS, "ops": ops_out, "tables": tables, "rep": rep, "errors": errors,
        "envelopeKeys": envelope_keys, "messageTables": msg_tables, "gaps": GAPS,
        "priority": SOURCE_PRIORITY, "conflicts": CONFLICTS, "decisions": DECISIONS,
    }
    json.dump(data, open(OUT / "data.json", "w"), ensure_ascii=False, indent=1)
    (OUT / "README.md").write_text(render_md(data), encoding="utf-8")
    tpl = (Path(__file__).parent / "template.html").read_text(encoding="utf-8")
    payload = json.dumps(data, ensure_ascii=False).replace("</", "<\\/")
    (OUT / "index.html").write_text(tpl.replace("/*__DATA__*/null", payload), encoding="utf-8")
    print(f"✓ {len(ops_out)} nghiệp vụ, {len(tables)} bảng trường → {OUT.relative_to(ROOT)}")


# ───────────────────────── Markdown ─────────────────────────
def md_table(t, kind):
    rows = ["| Chỉ tiêu | Key JSON | Kiểu | Độ dài | Mô tả | Bắt buộc | Req | Res | Ghi chú |", "|---|---|---|---|---|---|---|---|---|"]
    for f in t["fields"]:
        esc = lambda s: s.replace("|", "\\|").replace("\n", "<br>")  # noqa: E731
        rows.append(f"| {f['name']} | `{f['json']}` | {f['type']} | {f['size']} | {esc(f['desc'])} | {'✓' if f['required'] else ''} | {'✓' if f['req'] else ''} | {'✓' if f['res'] else ''} | {esc(f['note'])} |")
    if t["extra"]:
        rows.append("")
        rows.append("Danh mục / ghi chú kèm theo: " + "; ".join(" – ".join(v) for v in t["extra"][:40]))
    return "\n".join(rows)


def render_md(d):
    L = []
    w = L.append
    w("# API FPT.VNACCS (Customs Hub) – tài liệu tích hợp\n")
    w(f"> Sinh tự động bởi `scripts/vnaccs-api-docs/build.py` từ Postman `{d['generatedFrom']['postman']}` + {len(d['generatedFrom']['xlsx'])} file Excel đặc tả + mẫu phản hồi thật. **Đừng sửa tay** – sửa `ops.py`/`build.py` rồi chạy lại. Bản xem có sơ đồ, bấm vào từng nghiệp vụ: `docs/vnaccs-api/index.html`.\n")
    w(f"> **Nguồn ưu tiên khi lệch nhau**: {d['priority']}\n")
    w("## 1. Quy ước chung\n")
    w("- **Giao thức**: `POST` JSON tới `{FPT_BASE_URL}/api/<NGHIỆP VỤ>` (Postman dùng host test `http://tsst.fcs.vn`; production chỉ đổi URL).")
    w("- **Xác thực**: **Bearer token** cho mọi API nghiệp vụ – `POST {FPT_BASE_URL}/api/auth/login` `{username, password}` (tài khoản API FPT cấp) → `{token, expiration}`, rồi gửi `Authorization: Bearer <token>`; hết hạn/sai → 401, đăng nhập lại. (Postman 21/04/2026 còn ghi HTTP Basic – đã cũ, FPT đã chuyển hết sang Bearer.)")
    w(f"- **Tài khoản VNACCS của doanh nghiệp** gửi trong body: `{ACCOUNT}` = `{{useR_ID, password, terminaL_ID, terminaL_ACCESS_KEY}}` (các API VNACCS: IDx/EDx/AMx/HYS/VNACCSREP). Các API V5/định danh/tách vận đơn/container chỉ gửi `useR_ID` + mã doanh nghiệp.")
    w("- **Tên key**: tên chỉ tiêu Excel đổi kiểu camelCase của .NET – `TK_ECN` → `tK_ECN`, `USER_ID` → `useR_ID`, `LIST_FILE_HYS` → `lisT_FILE_HYS`. Riêng V5Bill/KVGS trong Postman viết HOA nguyên tên (`VD_SO`, `TK_SOTK`).")
    w("- **Kiểu dữ liệu**: ngày `dd/MM/yyyy` (chuỗi); số tờ khai `tK_ICN`/`tK_ECN`/`tK_SYN` là **number** 12 chữ số; tiền/lượng là number; file là base64 (HYS < 2MB/file).")
    w("- **Lỗi nghiệp vụ**: HTTP 200 + `errorList[]` `{errorCode, indexCode, nameCode, errorContent, proposedSolution, rowPosition}` (rowPosition = dòng hàng, \"0000\" = phần chung). Lỗi tài khoản/token: HTTP 401; body sai: 400.")
    w(f"- **Envelope phản hồi VNACCS**: `{{{', '.join(d['envelopeKeys'])}}}` – chỉ khối của nghiệp vụ vừa gọi có dữ liệu. Mỗi phần tử objIDA/objEDA/objAMA có `objMsgResult {{function, code, name, decNumber, time, type, ediBase64}}` + các object tờ khai.")
    w("- **Thông điệp loại C / P** (REP_VNACCS): C = trả ngay cho lệnh vừa gửi; P = Hải quan trả sau (phân luồng, thuế, kiểm tra thực tế, thông quan…) → lấy bằng **VNACCSREP**.\n")
    w("## 2. Luồng nghiệp vụ\n")
    for fid, title, steps, note in d["flows"]:
        w(f"### {title}\n\n`{' → '.join(' / '.join(s) for s in steps)}`\n\n{note}\n")
    w("## 3. Từng nghiệp vụ\n")
    for gid, gtitle in d["groups"]:
        w(f"### {gtitle}\n")
        for o in [o for o in d["ops"] if o["group"] == gid]:
            e = o["endpoint"]
            w(f"#### {o['id']} – {o['title']}\n")
            w(f"- **Endpoint**: `{e['method']} {e['base']}{e['path']}` · xác thực: {e['auth']}{'' if o['inPostman'] else ' · ⚠️ không có trong Postman (theo Excel)'}")
            w(f"- **Mục đích**: {o.get('purpose', '')}")
            if o.get("when"):
                w(f"- **Khi nào gọi**: {o['when']}")
            if o.get("next"):
                w(f"- **Bước tiếp theo**: {', '.join(o['next'])}")
            if o.get("body_note"):
                w(f"- **Body**: {o['body_note']}")
            if o.get("response_obj"):
                w(f"- **Phản hồi**: envelope, dữ liệu ở `{o['response_obj']}`")
            if o.get("response_note"):
                w(f"- **Ghi chú phản hồi**: {o['response_note']}")
            if o["repCodes"]:
                w("- **Mã thông điệp**: " + "; ".join(f"`{c['code']}` {c['name']} ({c['type']})" for c in o["repCodes"]))
            if o["sample"] is not None:
                w(f"\n<details><summary>Body mẫu (Postman, đã che mật khẩu, cắt base64) – đầy đủ: samples/{o['id']}.request.json</summary>\n\n```json\n{json.dumps(o['sample'], ensure_ascii=False, indent=2)[:6000]}\n```\n</details>\n")
            if o.get("realResponse"):
                w(f"<details><summary>Phản hồi thật</summary>\n\n```json\n{json.dumps(o['realResponse'], ensure_ascii=False, indent=2)[:6000]}\n```\n</details>\n")
            for g in o["fieldGroups"]:
                t = d["tables"][g["table"]]
                w(f"\n<details><summary>Trường – {g['label']} ({len(t['fields'])} trường · {t['file']} / {t['sheet']})</summary>\n\n{md_table(t, g['kind'])}\n</details>\n")
            w("")
    w("## 4. Bảng mã thông điệp phản hồi (REP_VNACCS)\n")
    w("| Nghiệp vụ | Mã | Tên | Loại | Khối phản hồi |\n|---|---|---|---|---|")
    for r in d["rep"]:
        w(f"| {r['op'] or ''} | `{r['code']}` | {r['name']} | {r['type']} | {r['response']} |")
    w("\n## 5. Thông điệp Hải quan trả về (khối vaF…, vaE…, vaL…, vaD…)\n")
    for m in d["messageTables"]:
        t = d["tables"][m["table"]]
        w(f"<details><summary>{m['key']} – {m['title']} ({len(t['fields'])} trường)</summary>\n\n{md_table(t, 'res')}\n</details>\n")
    w("## 6. Lỗi mẫu (thật)\n")
    for e in d["errors"]:
        w(f"**{e['title']}**\n\n```json\n{json.dumps(e['errorList'], ensure_ascii=False, indent=2)}\n```\n")
    w("## 7. Tình trạng tích hợp trong app (chung-tu-hq)\n")
    w("| Hạng mục | Tình trạng | Còn lại |\n|---|---|---|")
    for a, b, c in d["gaps"]:
        w(f"| {a} | {b} | {c} |")
    w("\n## 8. Postman lệch Excel – quyết định\n")
    w("| Hạng mục | Postman | Excel | Quyết định |\n|---|---|---|---|")
    for a, b, c, e in d["conflicts"]:
        w(f"| {a} | {b} | {c} | {e} |")
    w("\n## 9. Câu hỏi đã chốt\n")
    w("| Câu hỏi | Chốt |\n|---|---|")
    for q, a in d["decisions"]:
        w(f"| {q} | {a} |")
    w("\nCòn thiếu (không chặn việc làm): mẫu phản hồi thật của các API ngoài Login/EDA – khi có thì thêm vào `apps/fpt-mock/src/fixtures` và cho test so khớp.")
    return "\n".join(L) + "\n"


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--postman", required=True)
    ap.add_argument("--xlsx", default=str(ROOT / "TAI LIEU TICH HOP VNACCS"))
    build(ap.parse_args())
