// Nghiệp vụ đi kèm vận đơn (nhóm 3 "Vận đơn & vận chuyển"), gửi riêng, không nằm trong tờ khai:
// khai báo định danh hàng hóa (FPT V5IdentifierReq / V5IdentifierRes) và chia tách vận đơn (TachVanDonReq / TachVanDonRes, mẫu 12).
// Khóa ô = tên chỉ tiêu trong đặc tả FPT (tailieuchitieukhaibao/KHAI BAO LAY MA DINH DANH v1.1.xlsx, TACH VAN DON.xlsx).
import { fld, grp, hq, rep } from "./shared.js";
import type { FieldOption, LayoutBlock } from "./types.js";

export type TransportOperationForm = {
  id: "dinh-danh" | "tach-van-don";
  /** Tên nút ở nhóm Vận đơn & vận chuyển. */
  menu: string;
  title: string;
  description: string;
  /** API gửi / hỏi kết quả. */
  api: { request: string; response: string };
  /** Ô người khai nhập. */
  blocks: LayoutBlock[];
  /** Ô Hải quan trả về (chỉ đọc). */
  result: LayoutBlock[];
};

const req = { required: true } as const;

/** Thông tin doanh nghiệp / đại lý khai báo – chung cho hai nghiệp vụ. */
const declarerBlock: LayoutBlock = {
  id: "nguoi-khai", title: "Đơn vị khai báo", items: [
    fld("MA_HQ", "Mã chi cục Hải quan khai báo", "code", { codeTable: "A038", width: "sm", ...req }),
    grp("Doanh nghiệp khai báo", undefined, [fld("MA_DV", "Mã số thuế", "text", { width: "sm", ...req }), fld("TEN_DV", "Tên doanh nghiệp", "text", { width: "lg", ...req })]),
    grp("Đại lý khai thay (dùng chữ ký số đại lý)", undefined, [fld("MA_DAI_LY", "Mã số thuế đại lý", "text", { width: "sm" }), fld("TEN_DAI_LY", "Tên đại lý", "text", { width: "lg" })]),
    fld("USER_ID", "User ID tài khoản VNACCS (ký số qua cổng ký)", "text", { width: "sm" }),
  ],
};

const receiptFields = (states: FieldOption[]) => [
  hq("REF_ID", "Số tham chiếu"),
  hq("SO_TN", "Số tiếp nhận"),
  hq("NGAY_TN", "Ngày tiếp nhận", "date"),
  hq("NAM_TN", "Năm tiếp nhận"),
  hq("TRANG_THAI", "Trạng thái tiếp nhận", "choice", { options: states }),
  hq("KET_QUA", "Kết quả trả về", "text", { width: "full" }),
];

const STATES: FieldOption[] = [
  { value: "0", label: "Nhập mới" },
  { value: "10", label: "Từ chối" },
  { value: "11", label: "Chưa có phản hồi" },
  { value: "12", label: "Hải quan chấp nhận (có số tiếp nhận)" },
];

export const IDENTIFIER_FORM: TransportOperationForm = {
  id: "dinh-danh",
  menu: "Khai báo định danh",
  title: "Khai báo định danh hàng hóa",
  description: "Xin số định danh hàng hóa (kèm mã QR) để đưa hàng qua khu vực giám sát khi không có số vận đơn.",
  api: { request: "V5IdentifierReq", response: "V5IdentifierRes" },
  blocks: [
    {
      id: "doi-tuong", title: "Đối tượng và loại hàng", items: [
        fld("LOAI_DT", "Loại đối tượng", "choice", { ...req, options: [{ value: "1", label: "Doanh nghiệp xuất nhập khẩu" }, { value: "2", label: "Doanh nghiệp kho, bãi, cảng" }] }),
        fld("LOAI_HH", "Loại hàng hóa", "choice", { ...req, options: [{ value: "1", label: "Nhập khẩu" }, { value: "2", label: "Xuất khẩu" }, { value: "3", label: "Hàng nội địa (không xuất nhập khẩu)" }] }),
      ],
    },
    declarerBlock,
  ],
  result: [
    {
      id: "ket-qua-dinh-danh", title: "Kết quả định danh", emptyNote: "Có sau khi gửi khai báo định danh và hỏi kết quả.", items: [
        hq("SO_DD", "Số định danh"),
        hq("NGAY_DD", "Ngày định danh", "date"),
        hq("CODE_CONTENT", "Mã QR định danh"),
        ...receiptFields([...STATES, { value: "15", label: "Hải quan đã duyệt (có mã định danh)" }]),
      ],
    },
  ],
};

export const BILL_SPLIT_FORM: TransportOperationForm = {
  id: "tach-van-don",
  menu: "Chia tách vận đơn",
  title: "Chia tách vận đơn",
  description: "Tách một vận đơn gốc thành nhiều vận đơn nhánh để khai nhiều tờ khai (mẫu 12); tờ khai khai số vận đơn nhánh.",
  api: { request: "TachVanDonReq", response: "TachVanDonRes" },
  blocks: [
    {
      id: "van-don-goc", title: "Vận đơn gốc", items: [
        fld("TVD_VD_GOC", "Số vận đơn gốc", "text", { width: "md", ...req }),
        fld("TVD_VD_GOC_NGAY", "Ngày vận đơn", "date", { width: "sm", ...req }),
        fld("TVD_NGUOIPHATHANH", "Người phát hành", "text", { width: "md", ...req }),
        fld("TVD_VDNHANH_SOLUONG", "Số lượng vận đơn nhánh cần tách", "number", { width: "xs", ...req }),
        fld("TVD_LOAIHANG", "Loại hàng", "choice", { ...req, options: [{ value: "1", label: "Hàng container" }, { value: "0", label: "Hàng rời (hàng lẻ)" }] }),
        fld("TVD_LOAI", "Phân loại tách vận đơn", "choice", {
          ...req,
          options: [
            { value: "1", label: "Tách vận đơn cơ học", description: "Hàng tách biệt được theo vận đơn – lấy hàng riêng từng vận đơn nhánh (ví dụ mỗi container một mặt hàng)." },
            { value: "2", label: "Tách vận đơn lý thuyết", description: "Không tách biệt được hàng – chỉ để khai hải quan, khi lấy hàng phải lấy toàn bộ các vận đơn đã tách." },
          ],
        }),
      ],
    },
    declarerBlock,
    {
      id: "van-don-nhanh", title: "Vận đơn nhánh", items: [
        rep("Vận đơn nhánh (số thứ tự = số dòng; ví dụ VANDON-01, VANDON-02)", undefined, 20, [
          fld("TVDN_VD_NHANH{n}", "Số vận đơn nhánh", "text", { width: "md", ...req }),
          fld("TVDN_NGUOIGUI_TEN{n}", "Tên người gửi", "text", { width: "md", ...req }),
          fld("TVDN_NGUOIGUI_DIACHI{n}", "Địa chỉ người gửi", "text", { width: "md", ...req }),
          fld("TVDN_NGUOINHAN_TEN{n}", "Tên người nhận", "text", { width: "md", ...req }),
          fld("TVDN_NGUOINHAN_DIACHI{n}", "Địa chỉ người nhận", "text", { width: "md", ...req }),
          fld("TVDN_CONT_LUONG{n}", "Số lượng container", "number", { width: "xs", condition: "SPLIT_CONTAINER", ...req }),
          fld("TVDN_LUONG{n}", "Số lượng kiện", "number", { width: "xs", ...req }),
          fld("TVDN_LUONG_DVT{n}", "Đơn vị tính kiện", "code", { codeTable: "PACKAGE_KIND", width: "xs", ...req }),
          fld("TVDN_TRONGLUONG{n}", "Trọng lượng hàng", "number", { width: "sm", ...req }),
          fld("TVDN_TRONGLUONG_DVT{n}", "Đơn vị tính trọng lượng", "code", { codeTable: "UNIT", width: "xs", ...req }),
        ]),
      ],
    },
    {
      id: "container-nhanh", title: "Container của vận đơn nhánh", condition: "SPLIT_CONTAINER", items: [
        rep("Container (ghi số thứ tự vận đơn nhánh chứa container)", undefined, 50, [
          fld("TVDNC_STT{n}", "Vận đơn nhánh số", "number", { width: "xs", ...req }),
          fld("TVDNC_SOCONT{n}", "Số container", "text", { width: "sm", ...req }),
          fld("TVDNC_SOSEAL{n}", "Số seal", "text", { width: "md", ...req }),
        ]),
      ],
    },
  ],
  result: [{ id: "ket-qua-tach", title: "Kết quả tiếp nhận", emptyNote: "Có sau khi gửi khai báo tách vận đơn và hỏi kết quả.", items: receiptFields(STATES) }],
};
