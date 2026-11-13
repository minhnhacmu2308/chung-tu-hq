# Mô tả nghiệp vụ API FPT.VNACCS (Customs Hub) – viết tay, ghép với Postman + Excel đặc tả trong build.py.
# Nguồn: "API-VNACCS NEW.postman_collection_21042026.json" (FPT), "TAI LIEU TICH HOP VNACCS/*.xlsx", mẫu phản hồi thật docdungapivnacss/.

ACCOUNT = "objVNACCS_ACCOUNT"

GROUPS = [
    ("auth", "Xác thực & phản hồi chung"),
    ("import", "Tờ khai nhập khẩu (IDA…IID)"),
    ("export", "Tờ khai xuất khẩu (EDA…IEX)"),
    ("post", "Sửa đổi sau thông quan (AMA/AMB/AMC)"),
    ("attach", "Hồ sơ đính kèm & chứng từ bổ sung"),
    ("transport", "Vận đơn, định danh, container"),
    ("print", "In tờ khai / thông điệp"),
    ("catalog", "Danh mục"),
]

# Luồng hiển thị ở sơ đồ: (id, tiêu đề, các bước [op hoặc (op, nhãn)], ghi chú)
FLOWS = [
    ("flow-import", "Nhập khẩu – khai báo đến thông quan", [
        ["IDA"], ["IDB"], ["IDC"], ["VNACCSREP", "IID"],
    ], "IDA khai tạm → (IDB gọi lại để sửa, rồi IDA lần nữa) → IDC khai chính thức, Hải quan phân luồng → nhận thông điệp phân luồng/thuế/thông quan qua VNACCSREP hoặc tra IID."),
    ("flow-import-amend", "Nhập khẩu – sửa đổi bổ sung trước thông quan", [
        ["IDD"], ["IDA01"], ["IDE"], ["VNACCSREP", "IID"],
    ], "Tờ khai đã IDC: IDD gọi thông tin về → IDA01 khai sửa đổi (tạm) → IDE đăng ký sửa đổi chính thức."),
    ("flow-export", "Xuất khẩu – khai báo đến thông quan", [
        ["EDA"], ["EDB"], ["EDC"], ["VNACCSREP", "IEX"],
    ], "Giống nhập khẩu: EDA khai tạm → (EDB gọi lại sửa) → EDC khai chính thức → phân luồng/thông quan."),
    ("flow-export-amend", "Xuất khẩu – sửa đổi bổ sung trước thông quan", [
        ["EDD"], ["EDA01"], ["EDE"], ["VNACCSREP", "IEX"],
    ], "EDD gọi thông tin sửa đổi → EDA01 khai sửa đổi → EDE đăng ký sửa đổi chính thức."),
    ("flow-post", "Sửa đổi sau thông quan (tờ khai bổ sung)", [
        ["AMA"], ["AMB"], ["AMC"], ["VNACCSREP"],
    ], "AMA khai tạm tờ khai bổ sung (nhận số tK_SYN) → (AMB gọi lại sửa) → AMC đăng ký chính thức → Hải quan chấp nhận/không chấp nhận (VAL803–VAL806)."),
    ("flow-hys", "Hồ sơ đính kèm điện tử (HYS)", [
        ["KyFile"], ["hys"],
    ], "Ký số file (nếu cần) → gửi HYS nhận số tiếp nhận tK_JNO để ghi vào ô đính kèm của tờ khai (khai trước IDA/EDA)."),
    ("flow-v5", "Chứng từ đính kèm bổ sung V5 (sau khi có số tờ khai)", [
        ["V5Bill", "V5Invoice", "V5Permit", "V5Contract", "V5Co", "V5Container", "V5OtherDoc"], ["V5Response"],
    ], "Gửi từng loại chứng từ kèm file → nhận REF_ID → hỏi kết quả V5Response tới khi có số tiếp nhận / bị từ chối."),
    ("flow-transport", "Vận đơn & định danh hàng hóa", [
        ["V5IdentifierReq"], ["V5IdentifierRes"], ["TachVanDonReq"], ["TachVanDonRes"],
    ], "Khai định danh nhận REF_ID → hỏi kết quả lấy số định danh + QR. Tách vận đơn (nhập khẩu) → hỏi kết quả lấy số tiếp nhận."),
    ("flow-container", "Container", [
        ["ContainerReq", "V5ContainerReq"], ["ContainerRes", "V5ContainerRes"], ["KVGS"],
    ], "Khai danh sách container cho tờ khai → hỏi kết quả. KVGS: lấy thông tin đưa hàng qua khu vực giám sát (mã vạch)."),
]

# Mỗi nghiệp vụ. fields: [(nhãn đối tượng JSON, file excel, sheet, kind)] kind: req|res|both
OPS = {
    "login": {
        "group": "auth", "title": "Đăng nhập API (lấy token)", "code": None,
        "purpose": "Lấy JWT để gọi các API nghiệp vụ (mọi API dùng `Authorization: Bearer <token>`). Tài khoản API (username/password do FPT cấp cho phần mềm) khác tài khoản VNACCS của từng doanh nghiệp.",
        "when": "Trước mọi lời gọi; giữ token tới gần `expiration` rồi đăng nhập lại. Hết hạn / sai token → HTTP 401.",
        "response_note": "`{ token, expiration }` – JWT HS256, `expiration` dạng ISO có múi giờ. Mẫu thật: apps/fpt-mock/src/fixtures/login-response.json.",
        "fields": [],
        "real_response": "login-response",
    },
    "VNACCSREP": {
        "group": "auth", "title": "Lấy thông điệp phản hồi từ VNACCS", "code": "REP",
        "purpose": "Lấy các thông điệp Hải quan trả về sau (loại P trong REP_VNACCS): kết quả phân luồng (VAE1LD0…/VAD…), thông quan (VAE1LF0), chứng từ ghi số thuế (VAF8010), lệ phí (VAF8030), yêu cầu/hủy kiểm tra thực tế (VAE4740/VAD4870), chỉ thị sửa đổi (VAE8000/VAD8000), kết quả tờ khai bổ sung (VAL803–806).",
        "when": "Định kỳ sau IDC/EDC/IDE/EDE/AMC (và khi cần làm mới trạng thái). Body chỉ có tài khoản VNACCS của doanh nghiệp.",
        "response_note": "Chưa có mẫu phản hồi. Theo cấu trúc chung, phản hồi là envelope có các mảng objIDA/objEDA/objAMA (mỗi phần tử có objMsgResult.code = mã thông điệp) và các khối vaF8010/vaF8030/vaE4740/vaE8000/vaD8000/vaD4870/vaL0020. Cần FPT xác nhận: thông điệp đã lấy có bị xóa khỏi hàng đợi không (lấy một lần) hay lấy lại được.",
        "fields": [],
        "body_is_account": True,
    },
    # ───────── Nhập khẩu ─────────
    "IDA": {
        "group": "import", "title": "Khai tạm tờ khai nhập khẩu", "code": "IDA",
        "purpose": "Gửi toàn bộ thông tin tờ khai nhập (chung, vận đơn, khai trị giá, hàng). Hải quan cấp số tờ khai (tK_ICN), tự tính thuế dự kiến; tờ khai ở trạng thái khai tạm, chưa đăng ký.",
        "when": "Lần khai đầu; hoặc sau IDB (gọi lại) để gửi bản đã sửa. Lô > 50 dòng: tách tờ khai nhánh (tK_FIC/tK_BNO/tK_DNO).",
        "next": ["IDB", "IDC"],
        "response_obj": "objIDA",
        "fields": [("objVN_IDA", "VNACCS_IDA v1.2.xlsx", "VN_IDA", "both"), ("objVN_IDA_VANDON[]", "VNACCS_IDA v1.2.xlsx", "VN_IDA_VANDON", "both"),
                   ("objVN_IDA_KTG", "VNACCS_IDA v1.2.xlsx", "VN_IDA_KTG", "both"), ("objVN_IDA_HANG[]", "VNACCS_IDA v1.2.xlsx", "VN_IDA_HANG", "both"),
                   ("objVN_IDA_THUE[] (chỉ phản hồi)", "VNACCS_IDA v1.2.xlsx", "VN_IDA_THUE", "res"), ("objVN_IDA_CTHQ[] (chỉ phản hồi)", "VNACCS_IDA v1.2.xlsx", "VN_IDA_CTHQ", "res"),
                   ("objVN_IDA_TRANGTHAI (chỉ phản hồi)", "VNACCS_IDA v1.2.xlsx", "VN_IDA_TRANGTHAI", "res")],
    },
    "IDB": {
        "group": "import", "title": "Gọi tờ khai nhập đã khai tạm để sửa", "code": "IDB",
        "purpose": "Lấy lại thông tin tờ khai đã IDA (chưa IDC) để sửa; sau đó gửi lại IDA với cùng số tờ khai.",
        "when": "Sau IDA, trước IDC, khi cần sửa nội dung khai tạm.",
        "next": ["IDA"], "response_obj": "objIDA",
        "fields": [], "body_note": "Chỉ cần tài khoản VNACCS + `tK_ICN` (số tờ khai, số 12 chữ số – kiểu number).",
    },
    "IDC": {
        "group": "import", "title": "Khai chính thức tờ khai nhập (đăng ký)", "code": "IDC",
        "purpose": "Đăng ký tờ khai đã khai tạm; Hải quan kiểm tra và phân luồng (xanh/vàng/đỏ). Sau bước này không sửa bằng IDA được nữa – phải sửa đổi bổ sung (IDD/IDA01/IDE).",
        "when": "Sau IDA, khi người khai đã kiểm tra số tờ khai + thuế dự kiến.",
        "next": ["VNACCSREP", "IID", "IDD"], "response_obj": "objIDA",
        "fields": [], "body_note": "Tài khoản VNACCS + `tK_ICN`.",
    },
    "IDD": {
        "group": "import", "title": "Gọi thông tin sửa đổi tờ khai nhập", "code": "IDD",
        "purpose": "Gọi tờ khai đã đăng ký (đã phân luồng, chưa thông quan) về để khai sửa đổi bổ sung.",
        "when": "Sau IDC, trước thông quan, khi cần sửa.",
        "next": ["IDA01"], "response_obj": "objIDA",
        "fields": [], "body_note": "Tài khoản VNACCS + `tK_ICN`.",
    },
    "IDA01": {
        "group": "import", "title": "Khai sửa đổi tờ khai nhập (tạm)", "code": "IDA01",
        "purpose": "Gửi nội dung tờ khai nhập đã sửa sau IDD (cùng cấu trúc IDA).",
        "when": "Sau IDD.",
        "next": ["IDE", "IDD"], "response_obj": "objIDA",
        "fields": [("objVN_IDA", "VNACCS_IDA v1.2.xlsx", "VN_IDA", "both"), ("objVN_IDA_VANDON[]", "VNACCS_IDA v1.2.xlsx", "VN_IDA_VANDON", "both"),
                   ("objVN_IDA_KTG", "VNACCS_IDA v1.2.xlsx", "VN_IDA_KTG", "both"), ("objVN_IDA_HANG[]", "VNACCS_IDA v1.2.xlsx", "VN_IDA_HANG", "both")],
    },
    "IDE": {
        "group": "import", "title": "Đăng ký sửa đổi tờ khai nhập (chính thức)", "code": "IDE",
        "purpose": "Đăng ký chính thức bản sửa đổi đã khai ở IDA01; Hải quan xử lý lại (phân luồng lại nếu có).",
        "when": "Sau IDA01.",
        "next": ["VNACCSREP", "IID"], "response_obj": "objIDA",
        "fields": [], "body_note": "Tài khoản VNACCS + `tK_ICN`.",
    },
    "IID": {
        "group": "import", "title": "Tham chiếu (tra cứu) tờ khai nhập", "code": "IID",
        "purpose": "Lấy thông tin + trạng thái hiện tại của tờ khai nhập (luồng, thông quan, thuế).",
        "when": "Bất kỳ lúc nào đã có số tờ khai; dùng để làm mới trạng thái sau IDC/IDE.",
        "response_obj": "objIDA",
        "fields": [("objVN_IDA_TRANGTHAI", "VNACCS_IDA v1.2.xlsx", "VN_IDA_TRANGTHAI", "res")], "body_note": "Tài khoản VNACCS + `tK_ICN`.",
    },
    # ───────── Xuất khẩu ─────────
    "EDA": {
        "group": "export", "title": "Khai tạm tờ khai xuất khẩu", "code": "EDA",
        "purpose": "Gửi thông tin tờ khai xuất (chung, container, hàng). Hải quan cấp số tờ khai tK_ECN, tự tính các trường (tK_K01, tK_K08…); trạng thái khai tạm.",
        "when": "Lần khai đầu; hoặc sau EDB để gửi bản đã sửa.",
        "next": ["EDB", "EDC"], "response_obj": "objEDA",
        "real_response": "eda-response-success",
        "fields": [("objVN_EDA", "VNACCS_EDA v1.2.xlsx", "VN_EDA", "both"), ("objVN_EDA_CON[]", "VNACCS_EDA v1.2.xlsx", "VN_EDA_CON", "both"),
                   ("objVN_EDA_HANG[]", "VNACCS_EDA v1.2.xlsx", "VN_EDA_HANG", "both"), ("objVN_EDA_CTHQ[] (chỉ phản hồi)", "VNACCS_EDA v1.2.xlsx", "VN_EDA_CTHQ", "res"),
                   ("objVN_EDA_TRANGTHAI (chỉ phản hồi)", "VNACCS_EDA v1.2.xlsx", "VN_EDA_TRANGTHAI", "res")],
    },
    "EDB": {
        "group": "export", "title": "Gọi tờ khai xuất đã khai tạm để sửa", "code": "EDB",
        "purpose": "Lấy lại tờ khai đã EDA (chưa EDC) để sửa rồi gửi EDA lại. REP_VNACCS: VAE4000 \"Khai báo trước thông tin xuất khẩu\".",
        "when": "Sau EDA, trước EDC.", "next": ["EDA"], "response_obj": "objEDA",
        "fields": [], "body_note": "Tài khoản VNACCS + `tK_ECN`.",
    },
    "EDC": {
        "group": "export", "title": "Khai chính thức tờ khai xuất (đăng ký)", "code": "EDC",
        "purpose": "Đăng ký tờ khai xuất; Hải quan phân luồng (VAE1LD0/VAE2LD0/VAE3LD0 = luồng 1/2/3), thông quan (VAE1LF0/VAE2LF0).",
        "when": "Sau EDA.", "next": ["VNACCSREP", "IEX", "EDD"], "response_obj": "objEDA",
        "fields": [("Body", "VNACCS_EDA v1.2.xlsx", "EDC", "req")],
    },
    "EDD": {
        "group": "export", "title": "Gọi thông tin sửa đổi tờ khai xuất", "code": "EDD",
        "purpose": "Gọi tờ khai xuất đã đăng ký về để sửa đổi bổ sung (VAE4110).", "when": "Sau EDC, trước thông quan.",
        "next": ["EDA01"], "response_obj": "objEDA",
        "fields": [("Body", "VNACCS_EDA v1.2.xlsx", "EDD", "req")],
    },
    "EDA01": {
        "group": "export", "title": "Khai sửa đổi tờ khai xuất (tạm)", "code": "EDA01",
        "purpose": "Gửi nội dung tờ khai xuất đã sửa sau EDD (VAE0LB0).", "when": "Sau EDD.",
        "next": ["EDE"], "response_obj": "objEDA",
        "fields": [("Toàn bộ trường (sheet EDA01)", "VNACCS_EDA v1.2.xlsx", "EDA01", "req")],
    },
    "EDE": {
        "group": "export", "title": "Đăng ký sửa đổi tờ khai xuất (chính thức)", "code": "EDE",
        "purpose": "Đăng ký chính thức bản sửa đổi (VAE2LE0/VAE3LE0…).", "when": "Sau EDA01.",
        "next": ["VNACCSREP", "IEX"], "response_obj": "objEDA",
        "fields": [("Body", "VNACCS_EDA v1.2.xlsx", "EDE", "req")],
    },
    "IEX": {
        "group": "export", "title": "Tham chiếu (tra cứu) tờ khai xuất", "code": "IEX",
        "purpose": "Lấy thông tin + trạng thái tờ khai xuất (VAE0LC0 \"Tham chiếu thông tin tờ khai xuất khẩu\").",
        "when": "Bất kỳ lúc nào đã có số tờ khai.", "response_obj": "objEDA",
        "fields": [("objVN_EDA_TRANGTHAI", "VNACCS_EDA v1.2.xlsx", "VN_EDA_TRANGTHAI", "res")], "body_note": "Tài khoản VNACCS + `tK_ECN` (không phải tK_SOTK).",
    },
    # ───────── Sau thông quan ─────────
    "AMA": {
        "group": "post", "title": "Khai tạm tờ khai bổ sung sau thông quan", "code": "AMA",
        "purpose": "Khai bổ sung cho tờ khai đã thông quan (không sửa tờ khai gốc). Phản hồi VAL8000 (chưa đăng ký) kèm số tờ khai bổ sung tK_SYN.",
        "when": "Sau thông quan, trong thời hạn (60 ngày – TT121 Điều 20).",
        "next": ["AMB", "AMC"], "response_obj": "objAMA",
        "fields": [("objVN_AMA", "VNACCS_AMA v1.4.xlsx", "VN_AMA", "both"), ("objVN_AMA_HANG[]", "VNACCS_AMA v1.4.xlsx", "VN_AMA_HANG", "both"),
                   ("objVN_AMA_TRANGTHAI (chỉ phản hồi)", "VNACCS_AMA v1.4.xlsx", "VN_AMA_TRANGTHAI", "res")],
    },
    "AMB": {
        "group": "post", "title": "Gọi tờ khai bổ sung đã khai tạm để sửa", "code": "AMB",
        "purpose": "Lấy lại tờ khai bổ sung (VAL8010) để sửa rồi gửi AMA lại.", "when": "Sau AMA, trước AMC.",
        "next": ["AMA"], "response_obj": "objAMA", "fields": [], "body_note": "Tài khoản VNACCS + `tK_SYN` (số tờ khai bổ sung, number).",
    },
    "AMC": {
        "group": "post", "title": "Đăng ký tờ khai bổ sung (chính thức)", "code": "AMC",
        "purpose": "Đăng ký tờ khai bổ sung (VAL8020). Kết quả Hải quan: VAL8030/8040 (giảm/tăng thuế), VAL8050 (chấp nhận, không đổi thuế), VAL8060 (không chấp nhận).",
        "when": "Sau AMA.", "next": ["VNACCSREP"], "response_obj": "objAMA", "fields": [], "body_note": "Tài khoản VNACCS + `tK_SYN`.",
    },
    # ───────── Đính kèm ─────────
    "KyFile": {
        "group": "attach", "title": "Ký số file đính kèm", "code": None,
        "purpose": "Gửi file (base64) để hệ thống ký số theo mã doanh nghiệp trước khi đính kèm (HYS / chứng từ V5).",
        "when": "Trước hys/V5 khi file cần chữ ký số của doanh nghiệp.",
        "next": ["hys"], "fields": [],
        "body_note": "`mA_DV` (MST), `useR_ID` (user VNACCS), `filE_TEN`, `filE_BASE64`. Không có tài khoản VNACCS đầy đủ trong body.",
        "response_note": "Chưa có mẫu phản hồi – dự kiến trả file đã ký (base64). Cần FPT xác nhận.",
    },
    "hys": {
        "group": "attach", "title": "Khai hồ sơ đính kèm điện tử (HYS)", "code": "HYS",
        "purpose": "Gửi file đính kèm theo phân loại thủ tục (tK_TSB: A01 tờ khai trị giá, A02 danh sách container…). Hải quan trả số tiếp nhận tK_JNO (12 số) để ghi vào ô đính kèm của tờ khai. REP_VNACCS: VAL0020.",
        "when": "Trước IDA/EDA (số HYS ghi vào chỉ tiêu đính kèm), hoặc khi Hải quan yêu cầu.",
        "response_obj": "vaL0020",
        "fields": [("objVN_HYS", "VNACCS_HYS v1.2.xlsx", "HYS", "both"), ("lisT_FILE_HYS[]", "VNACCS_HYS v1.2.xlsx", "LIST_FILE", "req")],
        "body_note": "Danh sách file theo Excel là `lisT_FILE` (LIST_FILE) – Postman ghi `objVN_HYS.lisT_FILE_HYS` nhưng Postman có thể cũ, **theo Excel**. Mỗi file < 2MB. Đường dẫn Postman viết thường `/api/hys` (server không phân biệt hoa thường).",
    },
    "V5Bill": {"group": "attach", "title": "Bổ sung chứng từ – Vận đơn", "code": "V5",
               "purpose": "Đính kèm vận đơn (file + thông tin) cho tờ khai đã có số. Phản hồi REF_ID để hỏi kết quả.",
               "when": "Sau khi tờ khai có số (IDA/EDA/AMA).", "next": ["V5Response"],
               "fields": [("Body", "BO SUNG CHUNG TU v1.4.xlsx", "VẬN ĐƠN", "req")],
               "body_note": "Key trong Postman viết HOA (VD_SO, TK_SOTK…) khác các API khác (camel kiểu tK_…) – server .NET thường không phân biệt hoa thường, nhưng nên gửi đúng như mẫu."},
    "V5Invoice": {"group": "attach", "title": "Bổ sung chứng từ – Hóa đơn", "code": "V5", "fields": [("Body", "BO SUNG CHUNG TU v1.4.xlsx", "HÓA ĐƠN", "req")], "next": ["V5Response"], "postman": False,
                  "purpose": "Đính kèm hóa đơn cho tờ khai đã có số.", "when": "Sau khi tờ khai có số."},
    "V5Permit": {"group": "attach", "title": "Bổ sung chứng từ – Giấy phép", "code": "V5", "fields": [("Body", "BO SUNG CHUNG TU v1.4.xlsx", "GIẤY PHÉP", "req")], "next": ["V5Response"], "postman": False,
                 "purpose": "Đính kèm giấy phép.", "when": "Sau khi tờ khai có số."},
    "V5Contract": {"group": "attach", "title": "Bổ sung chứng từ – Hợp đồng", "code": "V5", "fields": [("Body", "BO SUNG CHUNG TU v1.4.xlsx", "HỢP ĐỒNG", "req")], "next": ["V5Response"], "postman": False,
                   "purpose": "Đính kèm hợp đồng.", "when": "Sau khi tờ khai có số."},
    "V5Co": {"group": "attach", "title": "Bổ sung chứng từ – C/O", "code": "V5", "fields": [("Body", "BO SUNG CHUNG TU v1.4.xlsx", "CO", "req")], "next": ["V5Response"], "postman": False,
             "purpose": "Đính kèm giấy chứng nhận xuất xứ.", "when": "Sau khi tờ khai có số."},
    "V5Container": {"group": "attach", "title": "Bổ sung chứng từ – Container", "code": "V5", "fields": [("Body", "BO SUNG CHUNG TU v1.4.xlsx", "CONTAINER", "req")], "next": ["V5Response"], "postman": False,
                    "purpose": "Đính kèm chứng từ container.", "when": "Sau khi tờ khai có số."},
    "V5OtherDoc": {"group": "attach", "title": "Bổ sung chứng từ – Chứng từ khác", "code": "V5", "fields": [("Body", "BO SUNG CHUNG TU v1.4.xlsx", "CHỨNG TỪ KHÁC", "req")], "next": ["V5Response"], "postman": False,
                   "purpose": "Đính kèm chứng từ khác.", "when": "Sau khi tờ khai có số."},
    "V5Response": {"group": "attach", "title": "Hỏi kết quả chứng từ bổ sung V5", "code": "V5",
                   "purpose": "Hỏi kết quả theo REF_ID + loại chứng từ (LOAI_CT: GP/HD/HDN/CO/VD…). Trả số tiếp nhận SO_TN, TRANG_THAI (0 nhập mới, 10 từ chối, 11 chưa có phản hồi…), KET_QUA.",
                   "when": "Sau mỗi V5…, lặp tới khi có số tiếp nhận hoặc bị từ chối.",
                   "fields": [("Body + phản hồi", "BO SUNG CHUNG TU v1.4.xlsx", "HỎI KQ V5 Đính kèm CTBS", "both"), ("errorList[]", "BO SUNG CHUNG TU v1.4.xlsx", "errorList", "res")]},
    # ───────── Vận đơn / container ─────────
    "V5IdentifierReq": {"group": "transport", "title": "Khai báo định danh hàng hóa", "code": None,
                        "purpose": "Xin số định danh hàng hóa (thay số vận đơn cho hàng không có vận đơn / theo quy định). Phản hồi REF_ID.",
                        "when": "Trước khi khai tờ khai cần số định danh.", "next": ["V5IdentifierRes"],
                        "fields": [("Body", "KHAI BAO LAY MA DINH DANH v1.1.xlsx", "Khai định danh", "req")]},
    "V5IdentifierRes": {"group": "transport", "title": "Hỏi kết quả khai báo định danh", "code": None,
                        "purpose": "Theo REF_ID: trả số định danh SO_DD, ngày, ảnh QR (CODE_CONTENT base64), trạng thái tiếp nhận.",
                        "when": "Sau V5IdentifierReq, lặp tới khi có kết quả.",
                        "fields": [("Body + phản hồi", "KHAI BAO LAY MA DINH DANH v1.1.xlsx", "Hỏi kết quả phản hồi định danh", "both"), ("errorList[]", "KHAI BAO LAY MA DINH DANH v1.1.xlsx", "errorList", "res")]},
    "TachVanDonReq": {"group": "transport", "title": "Khai báo tách vận đơn", "code": None,
                      "purpose": "Tách một vận đơn gốc thành nhiều vận đơn nhánh (hàng container hoặc hàng lẻ) – nhập khẩu.",
                      "when": "Trước khi khai tờ khai theo vận đơn nhánh.", "next": ["TachVanDonRes"],
                      "fields": [("Body – hàng container", "TACH VAN DON.xlsx", "Khai báo tách bill hàng cont", "req"), ("Body – hàng lẻ", "TACH VAN DON.xlsx", "Khai báo tách bill hàng lẻ", "req")]},
    "TachVanDonRes": {"group": "transport", "title": "Hỏi kết quả tách vận đơn", "code": None,
                      "purpose": "Theo REF_ID: số tiếp nhận, trạng thái, kết quả.", "when": "Sau TachVanDonReq.",
                      "fields": [("Body + phản hồi", "TACH VAN DON.xlsx", "Phản hồi", "both")]},
    "ContainerReq": {"group": "transport", "title": "Khai báo danh sách container", "code": None,
                     "purpose": "Bản cũ (file KHAI BAO DS CONT, không số phiên bản) – **dùng V5ContainerReq (Excel v1.1)** thay thế. Giữ ở đây vì Postman còn API này.", "when": "Không dùng cho tích hợp mới.", "next": ["ContainerRes"],
                     "fields": [("Body", "KHAI BAO DS CONT.xlsx", "Request", "req")]},
    "ContainerRes": {"group": "transport", "title": "Hỏi kết quả khai danh sách container", "code": None,
                     "purpose": "Theo REF_ID: số tiếp nhận, trạng thái.", "when": "Sau ContainerReq.",
                     "fields": [("Body + phản hồi", "KHAI BAO DS CONT.xlsx", "Response", "both")]},
    "V5ContainerReq": {"group": "transport", "title": "Khai danh sách container (bản V5)", "code": None, "postman": False,
                       "purpose": "Khai danh sách container/seal theo vận đơn cho tờ khai đã có số – **bản dùng**, đã nối (Excel v1.1; số seal bắt buộc). Postman chỉ có bản cũ ContainerReq.",
                       "when": "Sau khi có số tờ khai.", "next": ["V5ContainerRes"],
                       "fields": [("Body", "KHAI BAO DANH SACH CONTAINER v1.1.xlsx", "Khai danh sách container", "req")]},
    "V5ContainerRes": {"group": "transport", "title": "Hỏi kết quả khai danh sách container (bản V5)", "code": None, "postman": False,
                       "purpose": "Theo REF_ID. Đã nối (13/11/2026).", "when": "Sau V5ContainerReq.",
                       "fields": [("Body + phản hồi", "KHAI BAO DANH SACH CONTAINER v1.1.xlsx", "Hỏi kết quả danh sách container", "both"), ("errorList[]", "KHAI BAO DANH SACH CONTAINER v1.1.xlsx", "errorList", "res")]},
    "KVGS": {"group": "transport", "title": "Thông tin qua khu vực giám sát (mã vạch container)", "code": None,
             "purpose": "Lấy thông tin để đưa hàng/container qua khu vực giám sát hải quan (danh sách container + mã vạch) theo số tờ khai.",
             "when": "Sau thông quan / giải phóng hàng.", "fields": [],
             "body_note": "`TK_SOTK`, `TK_NGAYDK` (dd/MM/yyyy), `TK_MAHQ`, `MA_DV` – không có tài khoản VNACCS.",
             "response_note": "Chưa có đặc tả phản hồi trong bộ tài liệu. Tích hợp: chờ đặc tả phản hồi – hiện giả lập trong fpt-mock (2 bước)."},
    # ───────── In ─────────
    "PrintObjectRefIDA": {"group": "print", "title": "In tờ khai nhập từ object", "code": None,
                          "purpose": "Gửi object tờ khai nhập (như phản hồi IDA/IID: objVN_IDA, _VANDON, _KTG, _THUE, _TRANGTHAI, _CTHQ, _HANG) → nhận bản in.",
                          "when": "Khi cần bản in tờ khai theo mẫu Hải quan.", "fields": [], "response_note": "Chưa có mẫu phản hồi (dự kiến file in base64 / XPS / PDF)."},
    "PrintObjectRef": {"group": "print", "title": "In tờ khai xuất từ object", "code": None,
                       "purpose": "Như trên cho tờ khai xuất (objVN_EDA, _CON, _TRANGTHAI, _CTHQ, _HANG).", "when": "Khi cần bản in.", "fields": [],
                       "response_note": "Chưa có mẫu phản hồi."},
    "PrintEdiRef": {"group": "print", "title": "In thông điệp từ EDI", "code": None,
                    "purpose": "Gửi `ediBase64` (lấy từ objMsgResult.ediBase64 của phản hồi) → bản in thông điệp tương ứng (VD thông báo phân luồng VAE2LD0).",
                    "when": "In các thông điệp Hải quan trả về.", "fields": [], "response_note": "Chưa có mẫu phản hồi."},
    "PrintXPS": {"group": "print", "title": "Lấy file in XPS theo REF_ID", "code": None,
                 "purpose": "Lấy bản in dạng XPS theo `reF_ID`.", "when": "Sau các API trả REF_ID.", "fields": [], "response_note": "Chưa có mẫu phản hồi."},
    # ───────── Danh mục ─────────
    "SyncCategory": {"group": "catalog", "title": "Đồng bộ danh mục chuẩn VNACCS", "code": None,
                     "purpose": "Lấy danh mục VNACCS (chi cục A038, quốc gia A015, loại hình, cảng/sân bay A016, kho A202, đơn vị tính A501/A316, tiền tệ A527, biểu thuế A404, mã miễn giảm A520, ngân hàng…).",
                     "when": "Định kỳ (vd hằng ngày) để cập nhật danh mục thay vì nạp tay.", "fields": "CATALOG",
                     "body_note": "Body rỗng trong Postman.", "response_note": "Các bảng VN_A014…VN_A601 – xem bảng trường bên dưới (cột Response)."},
}

# Bảng thông điệp phản hồi riêng (khối va*** trong envelope) → sheet Excel
MESSAGE_TABLES = [
    ("vaF8010", "Chứng từ ghi số thuế phải thu", "VNACCS_IDA v1.2.xlsx", "VAF8010 Chung tu ghi so thue"),
    ("vaF8030", "Chứng từ ghi số lệ phí phải thu", "VNACCS_IDA v1.2.xlsx", "VAF8030 Chung tu le phi HQ"),
    ("vaD8000", "Chỉ thị Hải quan (nhập)", "VNACCS_IDA v1.2.xlsx", "VAD8000 - Chi thi hai quan"),
    ("vaD4870", "Yêu cầu kiểm tra thực tế hàng (nhập)", "VNACCS_IDA v1.2.xlsx", "VAD4870 kiem tra thuc te hang"),
    ("vaD4910", "Hủy kiểm tra thực tế hàng (nhập)", "VNACCS_IDA v1.2.xlsx", "VAD4910 huy kiem tra T.Te hang"),
    ("vaE8000", "Chỉ thị sửa đổi của Hải quan (xuất)", "VNACCS_EDA v1.2.xlsx", "VAE8000 Chi thi sua doi tu HQ"),
    ("vaE4740", "Yêu cầu kiểm tra thực tế hàng (xuất)", "VNACCS_EDA v1.2.xlsx", "VAE4740 Kiem tra thuc te hang"),
    ("vaE4780", "Hủy kiểm tra thực tế hàng (xuất)", "VNACCS_EDA v1.2.xlsx", "VAE4780 Huy kiem tra thuc te ha"),
    ("VAL8000-8020", "Tờ khai bổ sung (chưa/đã đăng ký)", "VNACCS_AMA v1.4.xlsx", "VAL8000-VAL8020"),
    ("VAL8030-8060", "Tờ khai bổ sung (kết quả Hải quan)", "VNACCS_AMA v1.4.xlsx", "VAL8030-VAL8040-VAL8050-VAL8060"),
]

# Điểm code hiện tại (chung-tu-hq) lệch với Postman 21/04/2026 – để sửa khi tích hợp thật.
GAPS = [
    ("IEX / IID", "Đã sửa (01/11/2026): nhập → IID `{tK_ICN}`, xuất → IEX `{tK_ECN}` (number); chiều lấy từ hồ sơ, thiếu thì suy từ số tờ khai (3… = xuất).", "–"),
    ("Gọi lại / sửa đổi", "Đã nối: IDB/EDB, IDD/EDD (body số tờ khai), IDA01/EDA01 (như IDA/EDA, đầu tờ khai mang số), IDE/EDE (trả phân luồng), AMB/AMC (body tK_SYN của bản khai bổ sung).", "–"),
    ("Phản hồi bất đồng bộ", "Đã nối: mỗi lượt hỏi trạng thái (customs-poll) gọi VNACCSREP trước, ghi thông điệp vào nhật ký của đúng tờ khai, cập nhật luồng/thông quan; sau đó vẫn tra IID/IEX.", "–"),
    ("HYS", "Gửi phẳng + `lisT_FILE` – đúng Excel (Postman bọc `objVN_HYS` + `lisT_FILE_HYS`, có thể cũ).", "Đối chiếu khi có phản hồi thật."),
    ("Container", "Đã nối (13/11/2026): V5ContainerReq/Res – body phẳng, USER_ID, không gửi mật khẩu; ADR 0014.", "Bản cũ ContainerReq/Res không dùng."),
    ("KVGS", "Chờ đặc tả phản hồi của FPT: cổng thật trả NOT_SUPPORTED; giả lập hai bước trong fpt-mock (gửi → hỏi lại) và bộ ánh xạ linh hoạt.", "Nối thật khi FPT gửi đặc tả phản hồi."),
    ("Bổ sung chứng từ V5, định danh, tách vận đơn, in, SyncCategory", "Chưa gọi (định danh/tách vận đơn mới có panel giao diện). Mock đã có đủ để làm.", "Làm theo thứ tự ưu tiên nghiệp vụ. KyFile không bắt buộc."),
]

# Thứ tự ưu tiên khi các nguồn lệch nhau: phản hồi thật (docdungapivnacss) > Excel đặc tả > Postman (có thể cũ).
SOURCE_PRIORITY = "Phản hồi thật của FPT (docdungapivnacss) > Excel đặc tả (TAI LIEU TICH HOP VNACCS) > Postman (có thể là bản cũ). Xác thực: Bearer token (đã xác nhận)."

# Chỗ Postman lệch Excel (so tự động từng key) và quyết định – (hạng mục, Postman, Excel, quyết định)
CONFLICTS = [
    ("HYS – danh sách file", "`objVN_HYS.lisT_FILE_HYS[]`", "`LIST_FILE` → `lisT_FILE` (phẳng, cùng cấp tK_CH…)", "Theo Excel: `lisT_FILE`. Mock nhận cả hai."),
    ("IDA – đội thủ tục", "Body mẫu không có `tK_CHB`", "`TK_CHB` bắt buộc (Text 2)", "Theo Excel: luôn gửi `tK_CHB` (app đang gửi \"00\" mặc định)."),
    ("AMA – dòng hàng", "Có thêm `haG_AMA`, `haG_MMA`", "VN_AMA_HANG v1.4 không có hai trường này", "Theo Excel: không gửi."),
    ("Khai danh sách container", "Chỉ có `ContainerReq/Res` (seal không bắt buộc, có CTHQ_CCM/CTHQ_D01)", "Có cả bản cũ (KHAI BAO DS CONT) và `V5ContainerReq/Res` v1.1 (seal bắt buộc, có errorList)", "Theo Excel bản có số phiên bản: `V5ContainerReq/Res` v1.1."),
    ("EDA – dòng hàng", "Không có `haG_XX`", "`HAG_XX` đánh dấu bắt buộc, không mô tả", "Theo phản hồi thật: EDA thật không có `haG_XX` vẫn thành công → không gửi."),
    ("Xác thực", "HTTP Basic", "Không ghi", "Bearer token (đã xác nhận với FPT, mock đang dùng)."),
]

# Câu hỏi mở trước đây → đã chốt theo Excel / nguồn sẵn có
DECISIONS = [
    ("Basic hay Bearer?", "Bearer token từ /api/auth/login cho mọi API."),
    ("ContainerReq hay V5ContainerReq?", "V5ContainerReq/Res (Excel v1.1)."),
    ("HYS: lisT_FILE hay lisT_FILE_HYS?", "lisT_FILE (Excel)."),
    ("Có cần KyFile / chữ ký số trong payload?", "Không: Excel IDA/EDA/HYS/V5 không có trường chữ ký → không ký trong payload; KyFile để dành khi FPT yêu cầu."),
    ("VNACCSREP lấy một lần hay lấy lại được?", "Excel không mô tả → app coi là lấy một lần: lưu ngay mọi thông điệp nhận được (idempotent theo mã thông điệp + số tờ khai) và vẫn tra IID/IEX để chắc trạng thái."),
    ("Tần suất hỏi kết quả (…Res, VNACCSREP)?", "Họp nghiệp vụ 01/11/2026: cách chính là nút bấm tay (người khai bấm \"Tra cứu trạng thái\" → VNACCSREP + IID/IEX); tự động chỉ là lưới an toàn 5 phút/lần, không hỏi dồn theo giây."),
    ("Tách tờ khai > 50 dòng (TK_FIC/TK_BNO/TK_DNO, TK_TP)?", "Họp nghiệp vụ 01/11/2026: tờ 1 TK_FIC = \"F\", nhánh k/N; tờ 2..N TK_FIC = số tờ khai nhánh 1 (khai nhánh 1 có số rồi mới khai nhánh 2). Tổng trị giá hóa đơn giữ nguyên cả lô; TK_TP (tổng hệ số phân bổ) bắt buộc, phần mềm tự tính, không cho sửa tay."),
    ("IDA01/EDA01 – chỉ thị Hải quan?", "Họp nghiệp vụ 01/11/2026: gửi lại objVN_<KIND>_CTHQ NGUYÊN VĂN như Hải quan trả (không trim khoảng trắng) – lệch một ký tự VNACCS từ chối. Postman IDA01 đang thiếu khối này."),
    ("Thông điệp loại B / C?", "Họp nghiệp vụ 01/11/2026: B kèm ediBase64 (EDI chuẩn – lưu trữ, in tờ khai), C chỉ là thông báo. App lưu ediBase64 trong hộp thư customs_inbox."),
    ("Mã chi cục trả về?", "Họp nghiệp vụ 01/11/2026: VNACCS trả tên viết tắt chi cục (TK_A07), không trả mã → app lưu mã chi cục gốc từ lúc tạo hồ sơ, không map ngược từ tên."),
    ("HTTPS?", "Họp nghiệp vụ 01/11/2026: mọi endpoint VNACCS/FPT bắt buộc https:// – production chặn http (trừ máy nội bộ như fpt-mock)."),
    ("Khai thử nghiệm?", "Họp nghiệp vụ 01/11/2026: mã chi cục test 88AB."),
]
