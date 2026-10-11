# Project Tasks

Tệp này dùng để quản lý các task (nhiệm vụ) trong dự án LeadPurify.
Mỗi khi cần thực hiện một tính năng mới, fix bug, hay thay đổi code, các bước thực hiện chi tiết phải được ghi chép vào đây trước khi bắt đầu code thực tế.

## Các Task Đang Thực Hiện
- [ ] Chưa có task nào.

## Task Đã Hoàn Thành
- [x] Tạo `context.md`, `memory.md`, `task.md` và các Rule cho AI.
- [x] Gộp màn hình Hàng đợi và Kiểm tra hoạt động thành 1, bổ sung tùy chọn linh hoạt (link sống chết, avatar, Apify).
- [x] Hiển thị nhãn mô tả tiến trình đã sửa ảnh bằng Apify trong màn hình Lịch sử.
- [x] Bổ sung nút chạy sửa ảnh bằng Apify cho các tiến trình chưa sửa trong Lịch sử (đưa về hàng đợi).
- [x] Bổ sung nút "Chạy sửa ảnh bằng Apify hàng loạt" trong Tab Lịch sử (API backend batch-fix-avatar và button trên UI).
- [x] Task Redesign: Áp dụng hệ thống giao diện Liquid Glass cho toàn bộ site theo design.md:
  - [x] 1. Thiết lập hệ thống CSS Design Tokens (Liquid Glass: màu sắc, blur động, hiệu ứng ánh sáng iridescent, typography, nút bấm, inputs) trong `index.css`
  - [x] 2. Tái cấu trúc và nâng cấp giao diện toàn bộ `App.jsx` (Header, Upload, Cấu hình quét, Hàng đợi, Lịch sử, Quản lý API Key, Quick Guide) chuẩn Liquid Glass và tuân thủ Do's & Don'ts (không emoji, min-h 100dvh, micro-animations)
  - [x] 3. Nâng cấp giao diện Modal `CsvEditorModal.jsx` và `CsvEditorModal.css` theo phong cách Liquid Glass
  - [x] 4. Kiểm tra build, lint, và chạy thử nghiệm giao diện để đảm bảo tính thẩm mỹ, mượt mà và không có lỗi logic/layout
