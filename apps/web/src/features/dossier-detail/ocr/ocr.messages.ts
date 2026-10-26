import { defineMessages } from "@kb/ui";

export const CROSS_CHECK_MESSAGES = defineMessages({
  vi: {
    pass: "Khớp", warn: "Lưu ý", fail: "Lỗi", skipped: "Chưa kiểm tra", blocksSubmit: "Chặn truyền tờ khai",
    title: "AI đối chiếu chéo", rulesRun: "{n} luật đã chạy trên bộ chứng từ",
    passCount: "{n} khớp", warnCount: "{n} lưu ý", failCount: "{n} lỗi", skippedCount: "{n} chờ dữ liệu",
    notEnough: "Chưa đủ chứng từ để đối chiếu.", issuesLabel: "Luật cần chú ý",
    showOthers: "Xem {n} luật khác (đã khớp / chờ dữ liệu)", hideOthers: "Ẩn {n} luật khác (đã khớp / chờ dữ liệu)",
    passedLabel: "Luật đã khớp hoặc chờ dữ liệu",
  },
  en: {
    pass: "Match", warn: "Warning", fail: "Error", skipped: "Not checked", blocksSubmit: "Blocks declaration submission",
    title: "AI cross-check", rulesRun: "{n} rules run on the document set",
    passCount: "{n} matched", warnCount: "{n} warnings", failCount: "{n} errors", skippedCount: "{n} awaiting data",
    notEnough: "Not enough documents to cross-check yet.", issuesLabel: "Rules needing attention",
    showOthers: "Show {n} other rules (matched / awaiting data)", hideOthers: "Hide {n} other rules (matched / awaiting data)",
    passedLabel: "Rules matched or awaiting data",
  },
  zh: {
    pass: "一致", warn: "注意", fail: "错误", skipped: "未检查", blocksSubmit: "阻止发送报关单",
    title: "AI 交叉核对", rulesRun: "已对单证运行 {n} 条规则",
    passCount: "{n} 条一致", warnCount: "{n} 条注意", failCount: "{n} 条错误", skippedCount: "{n} 条待数据",
    notEnough: "单证不足，暂无法核对。", issuesLabel: "需关注的规则",
    showOthers: "查看其他 {n} 条规则（一致 / 待数据）", hideOthers: "隐藏其他 {n} 条规则（一致 / 待数据）",
    passedLabel: "已一致或待数据的规则",
  },
});

export const DOCUMENT_SHEETS_MESSAGES = defineMessages({
  vi: {
    colStt: "STT", colLabel: "Tên trường", colValue: "Trị giá",
    exported: "Đã xuất Excel bảng đọc chứng từ", exportFailed: "Không xuất được Excel",
    title: "Bảng đọc chứng từ", description: "Theo danh mục trường chuẩn của từng loại chứng từ – giống bảng người khai lập tay, dùng để đối chiếu và lưu hồ sơ.",
    exportExcel: "Xuất Excel", emptyTitle: "Chưa có chứng từ đọc xong", emptyDescription: "Bảng đọc hiện khi AI đọc xong ít nhất một chứng từ.",
    tabsLabel: "Bảng đọc theo chứng từ", tableLabel: "Bảng đọc {file}", noFields: "Không có trường",
  },
  en: {
    colStt: "No.", colLabel: "Field name", colValue: "Value",
    exported: "Document reading table exported to Excel", exportFailed: "Couldn't export Excel",
    title: "Document reading table", description: "Follows the standard field list of each document type – like the table a declarant prepares by hand, for cross-checking and record keeping.",
    exportExcel: "Export Excel", emptyTitle: "No documents read yet", emptyDescription: "The table appears once AI has finished reading at least one document.",
    tabsLabel: "Reading table by document", tableLabel: "Reading table {file}", noFields: "No fields",
  },
  zh: {
    colStt: "序号", colLabel: "字段名称", colValue: "值",
    exported: "已将单证读取表导出为 Excel", exportFailed: "无法导出 Excel",
    title: "单证读取表", description: "按各类单证的标准字段目录排列 – 与申报员手工制作的表格相同，用于核对和归档。",
    exportExcel: "导出 Excel", emptyTitle: "暂无已读取完成的单证", emptyDescription: "AI 读取完至少一份单证后显示读取表。",
    tabsLabel: "按单证查看读取表", tableLabel: "读取表 {file}", noFields: "无字段",
  },
});

export const ITEMS_TABLE_MESSAGES = defineMessages({
  vi: {
    description: "Mô tả hàng hóa", quantity: "Số lượng", unit: "ĐVT", unitPrice: "Đơn giá", amount: "Thành tiền", origin: "Xuất xứ",
    caption: "Danh sách hàng hóa", status: "Trạng thái", confirmRow: "Xác nhận dòng này đúng", confirmRowN: "Xác nhận dòng {n} đúng",
    confirmed: "Đã xác nhận", checked: "Đã đối chiếu", total: "Cộng {n} dòng",
  },
  en: {
    description: "Goods description", quantity: "Quantity", unit: "Unit", unitPrice: "Unit price", amount: "Amount", origin: "Origin",
    caption: "Goods list", status: "Status", confirmRow: "Confirm this line is correct", confirmRowN: "Confirm line {n} is correct",
    confirmed: "Confirmed", checked: "Cross-checked", total: "Total {n} lines",
  },
  zh: {
    description: "货物描述", quantity: "数量", unit: "单位", unitPrice: "单价", amount: "金额", origin: "原产地",
    caption: "货物清单", status: "状态", confirmRow: "确认此行正确", confirmRowN: "确认第 {n} 行正确",
    confirmed: "已确认", checked: "已核对", total: "合计 {n} 行",
  },
});

export const FIELD_ROW_MESSAGES = defineMessages({
  vi: { confirmField: "Xác nhận {label} đúng", correct: "Đúng", aiRead: "AI đọc:", revert: "Hoàn tác", pickOnFile: "Chỉ vị trí {label} trên file" },
  en: { confirmField: "Confirm {label} is correct", correct: "Correct", aiRead: "AI read:", revert: "Undo", pickOnFile: "Point to {label} on the file" },
  zh: { confirmField: "确认{label}正确", correct: "正确", aiRead: "AI 读取：", revert: "撤销", pickOnFile: "在文件上指出{label}" },
});

export const FIELD_MUTATION_MESSAGES = defineMessages({
  vi: { saveFailed: "Không lưu được giá trị", confirmFailed: "Không xác nhận được trường", revertFailed: "Không hoàn tác được" },
  en: { saveFailed: "Couldn't save the value", confirmFailed: "Couldn't confirm the field", revertFailed: "Couldn't undo" },
  zh: { saveFailed: "无法保存值", confirmFailed: "无法确认字段", revertFailed: "无法撤销" },
});

/** Chỉ trên file + ghi nhớ cách đọc (skill tự học từ việc kiểm tra). */
export const SKILL_LEARN_MESSAGES = defineMessages({
  vi: {
    pickTitle: "Chỉ vị trí “{label}” trên file",
    pickBody: "Kéo chuột khoanh vùng chứa giá trị, hoặc bấm vào chữ. Nhấn Esc để hủy.",
    pickCancel: "Hủy",
    pickEmpty: "Không đọc được chữ ở vùng này",
    pickEmptyDesc: "File scan/ảnh không có lớp chữ – hãy gõ giá trị vào ô.",
    pickFilled: "Đã điền {label}: {value}",
    aliasNoted: "Đã ghi nhận nhãn “{alias}” trên chứng từ. Khi được duyệt trong Cách đọc chứng từ, AI sẽ tự nhận ra nhãn này.",
    learnedTitle: "Đã ghi nhớ cách đọc",
    learnedDesc: "{n} chứng từ bạn vừa sửa sẽ giúp AI đọc chính xác hơn lần sau.",
    learnedSupplier: "Đã tạo cách đọc riêng cho {supplier} – lần sau AI đọc chứng từ của nhà cung cấp này chính xác hơn.",
  },
  en: {
    pickTitle: "Point to “{label}” on the file",
    pickBody: "Drag to box the value, or click on the text. Press Esc to cancel.",
    pickCancel: "Cancel",
    pickEmpty: "No text found in this area",
    pickEmptyDesc: "Scans/images have no text layer – type the value into the box.",
    pickFilled: "Filled {label}: {value}",
    aliasNoted: "Noted the printed label “{alias}”. Once approved in Document reading, the AI will recognize it.",
    learnedTitle: "Reading lessons saved",
    learnedDesc: "The {n} documents you corrected will help the AI read more accurately next time.",
    learnedSupplier: "Created a dedicated reading setup for {supplier} – their documents will be read more accurately next time.",
  },
  zh: {
    pickTitle: "在文件上指出“{label}”",
    pickBody: "拖动鼠标框选该值，或点击文字。按 Esc 取消。",
    pickCancel: "取消",
    pickEmpty: "此区域未识别到文字",
    pickEmptyDesc: "扫描件/图片没有文字层 —— 请在输入框中键入该值。",
    pickFilled: "已填入 {label}：{value}",
    aliasNoted: "已记录单证上的标签“{alias}”。在“单证读取方式”中通过后，AI 将自动识别该标签。",
    learnedTitle: "已记住读取方式",
    learnedDesc: "您刚修改的 {n} 份单证将帮助 AI 下次读得更准确。",
    learnedSupplier: "已为 {supplier} 创建专用读取方式 —— 下次读取该供应商的单证会更准确。",
  },
});
