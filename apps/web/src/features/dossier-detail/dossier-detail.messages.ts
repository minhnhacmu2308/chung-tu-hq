import { defineMessages } from "@kb/ui";

export const DOSSIER_DETAIL_MESSAGES = defineMessages({
  vi: {
    postStep: "Sửa sau thông quan",
    canceled: "Đã hủy hồ sơ", exportedJson: "Đã xuất JSON", exportedJsonDesc: "{file} – dữ liệu lô hàng chuẩn hóa (bản mô phỏng)",
    breadcrumbList: "Hồ sơ khai báo", exportJson: "Xuất JSON", moreActions: "Thao tác khác", cancel: "Hủy hồ sơ",
    dueOn: "Hạn khai {date}", cancelTitle: "Hủy hồ sơ này?", cancelDesc: "{code} sẽ chuyển sang trạng thái Đã hủy. Chứng từ và kết quả đọc vẫn được giữ lại.",
    keep: "Giữ hồ sơ", loading: "Đang tải hồ sơ", notFound: "Không tìm thấy hồ sơ", loadFailed: "Không tải được hồ sơ",
    notFoundDesc: "Hồ sơ \"{id}\" không tồn tại hoặc bạn không có quyền xem.", loadFailedDesc: "Kiểm tra kết nối rồi thử lại.",
    backToList: "Về danh sách hồ sơ", retry: "Thử lại", viewFlow: "Xem cây quy trình", flowTitle: "Quy trình hồ sơ {code}",
    canceledTitle: "Hồ sơ đã hủy", canceledDesc: "Hồ sơ không còn xử lý tiếp. Bạn vẫn xem được chứng từ và kết quả đọc ở các bước đã qua.",
    advanceFailed: "Không chuyển được sang bước tiếp theo",
  },
  en: {
    postStep: "Post-clearance amendment",
    canceled: "Dossier cancelled", exportedJson: "JSON exported", exportedJsonDesc: "{file} – normalized shipment data (simulation)",
    breadcrumbList: "Dossiers", exportJson: "Export JSON", moreActions: "More actions", cancel: "Cancel dossier",
    dueOn: "Filing deadline {date}", cancelTitle: "Cancel this dossier?", cancelDesc: "{code} will be marked Cancelled. Documents and reading results are kept.",
    keep: "Keep dossier", loading: "Loading dossier", notFound: "Dossier not found", loadFailed: "Couldn't load the dossier",
    notFoundDesc: "Dossier \"{id}\" doesn't exist or you don't have permission to view it.", loadFailedDesc: "Check your connection and try again.",
    backToList: "Back to dossiers", retry: "Retry", viewFlow: "View workflow", flowTitle: "Workflow of dossier {code}",
    canceledTitle: "Dossier cancelled", canceledDesc: "This dossier is no longer processed. You can still view documents and reading results from completed steps.",
    advanceFailed: "Couldn't move to the next step",
  },
  zh: {
    postStep: "通关后修改",
    canceled: "档案已取消", exportedJson: "已导出 JSON", exportedJsonDesc: "{file} – 标准化货物数据（模拟版本）",
    breadcrumbList: "申报档案", exportJson: "导出 JSON", moreActions: "更多操作", cancel: "取消档案",
    dueOn: "申报期限 {date}", cancelTitle: "取消此档案？", cancelDesc: "{code} 将变为“已取消”状态。单证和读取结果仍会保留。",
    keep: "保留档案", loading: "正在加载档案", notFound: "未找到档案", loadFailed: "无法加载档案",
    notFoundDesc: "档案“{id}”不存在，或您无权查看。", loadFailedDesc: "请检查网络连接后重试。",
    backToList: "返回档案列表", retry: "重试", viewFlow: "查看流程图", flowTitle: "档案 {code} 的流程",
    canceledTitle: "档案已取消", canceledDesc: "该档案不再继续处理。您仍可查看已完成步骤中的单证和读取结果。",
    advanceFailed: "无法进入下一步",
  },
});

/** Cây quy trình (workflow-flow.ts). */
export const WORKFLOW_FLOW_MESSAGES = defineMessages({
  vi: {
    start: "Bắt đầu", create: "Tạo hồ sơ", upload: "Upload chứng từ", uploadDesc: "Tách trang, phân loại, bỏ bản trùng",
    ocr: "OCR & kiểm tra", ocrDesc: "AI đọc + đối chiếu chéo", blocker: "Còn trường nghi ngờ?",
    fix: "Sửa & xác nhận dữ liệu", fixSuspect: "{n} trường nghi ngờ", fixConfirm: "Người dùng xác nhận",
    agent: "AI Agent xử lý", agentDesc: "Tra HS · ánh xạ · số hóa", review: "Review tờ khai", reviewDesc: "Người duyệt phê duyệt",
    submit: "Khai báo Hải quan", submitDesc: "{ops} → HYS qua Customs Hub", channel: "Phân luồng",
    inspect: "Kiểm tra hồ sơ / hàng", inspectDesc: "Luồng vàng hoặc đỏ", end: "Thông quan",
    yes: "Có", no: "Không", yellowRed: "Vàng / Đỏ", green: "Xanh",
  },
  en: {
    start: "Start", create: "Create dossier", upload: "Upload documents", uploadDesc: "Split pages, classify, remove duplicates",
    ocr: "OCR & check", ocrDesc: "AI reading + cross-check", blocker: "Suspect fields left?",
    fix: "Fix & confirm data", fixSuspect: "{n} suspect fields", fixConfirm: "User confirms",
    agent: "AI Agent processing", agentDesc: "HS lookup · mapping · digitization", review: "Review declaration", reviewDesc: "Approver approves",
    submit: "Customs filing", submitDesc: "{ops} → HYS via Customs Hub", channel: "Channel",
    inspect: "Document / goods inspection", inspectDesc: "Yellow or red channel", end: "Clearance",
    yes: "Yes", no: "No", yellowRed: "Yellow / Red", green: "Green",
  },
  zh: {
    start: "开始", create: "创建档案", upload: "上传单证", uploadDesc: "拆分页面、分类、去除重复",
    ocr: "OCR 与检查", ocrDesc: "AI 读取 + 交叉核对", blocker: "仍有存疑字段？",
    fix: "修改并确认数据", fixSuspect: "{n} 个存疑字段", fixConfirm: "用户确认",
    agent: "AI Agent 处理", agentDesc: "查 HS · 映射 · 数字化", review: "审核报关单", reviewDesc: "审批人批准",
    submit: "海关申报", submitDesc: "{ops} → HYS 经 Customs Hub", channel: "分流",
    inspect: "单证 / 货物查验", inspectDesc: "黄色或红色通道", end: "通关",
    yes: "是", no: "否", yellowRed: "黄 / 红", green: "绿",
  },
});
