/**
 * Bố cục bản in VNACCS (docs/superpowers/specs/2026-10-20-review-ban-in-to-khai-design.md §4.1).
 * Dữ liệu thuần: mỗi ô trỏ tới một khóa ĐÃ CÓ trong `declaration-layout` (không tạo khóa mới); `label` = chữ in trên mẫu ("" khi mẫu không in nhãn).
 */
/** span: số cột trên lưới 12 cột của trang; align "end": căn phải (số tiền). */
export type PrintCell = { key: string; label: string; span?: 1 | 2 | 3 | 4 | 6 | 12; align?: "end" };
/** Dòng lặp: key chứa "{n}" (1..count) hoặc "{nn}" (01..count) như LayoutRepeat; mỗi lần lặp = một dòng các ô `cells`. `label`: tiêu đề in phía trên nhóm (vd "Các khoản điều chỉnh"). */
export type PrintRepeatRow = { kind: "repeat"; label?: string; count: number; cells: PrintCell[] };
export type PrintRow = PrintCell[] | PrintRepeatRow;
export type PrintRegion = { id: string; title?: string; rows: PrintRow[] };
/** Vùng dạng cặp = hai vùng nằm cạnh nhau như mẫu (vận đơn | địa điểm…). */
export type PrintPage = { id: string; regions: (PrintRegion | [PrintRegion, PrintRegion])[] };
/**
 * header: đầu trang lặp ở mọi trang; pages: các trang chung của tờ khai; item: khối một dòng hàng, `itemsPerPage` khối mỗi trang.
 * Tổng số trang = pages.length + ceil(số dòng hàng / itemsPerPage).
 */
export type PrintLayout = { kind: "IDA" | "EDA"; header: PrintRow[]; pages: PrintPage[]; item: PrintRegion[]; itemsPerPage: 1 | 2 };
