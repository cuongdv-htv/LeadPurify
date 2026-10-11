# Project Tasks

Tệp này dùng để quản lý các task (nhiệm vụ) trong dự án LeadPurify.
Mỗi khi cần thực hiện một tính năng mới, fix bug, hay thay đổi code, các bước thực hiện chi tiết phải được ghi chép vào đây trước khi bắt đầu code thực tế.

## Các Task Đang Thực Hiện
- [ ] Chưa có task nào.

## Task Đã Hoàn Thành
- [x] Task Resilience & Crash Recovery: Xử lý pending chạy lại, server đóng đột ngột, checkpointing & khôi phục dữ liệu:
  - [x] 1. Xây dựng cơ chế Checkpoint & Lưu trữ an toàn (Safe/Atomic Write cho `queue.json`, Backup file `.bak`, lưu tiến độ trung gian `checkpoint_{jobId}.json`).
  - [x] 2. Xử lý đóng server đột ngột & Graceful Shutdown (Bắt sự kiện SIGINT, SIGTERM, uncaughtException, đóng Puppeteer browsers sạch sẽ, cập nhật trạng thái INTERRUPTED cho job đang chạy).
  - [x] 3. Cơ chế Tự động khôi phục khi Server khởi động lại (Startup Recovery: Tự động chạy lại các job PENDING, phát hiện job INTERRUPTED và cho phép tiếp tục/chạy lại, khôi phục hàng đợi từ backup nếu file hỏng).
  - [x] 4. Bổ sung API endpoints Backend (`/retry`, `/resume`, `/batch-retry`, `/batch-resume`, `/trigger`, `/shutdown`, bảo vệ `isWorkerRunning` bằng try-finally).
  - [x] 5. Nâng cấp Giao diện Frontend (`App.jsx`):
    - Hiển thị badge trạng thái `INTERRUPTED` (Bị gián đoạn) và badge Checkpoint đã lưu.
    - Bổ sung nút "Tiếp tục" (Resume from checkpoint) và "Chạy lại" (Retry from beginning) cho các job Lỗi / Gián đoạn / Đã hủy.
    - Bổ sung nút "Chạy lại tất cả lỗi / gián đoạn" và "Kích hoạt lại hàng đợi" trên thanh công cụ.
    - Tự động đồng bộ và khôi phục kết nối Socket.IO khi server restart, hiển thị trạng thái kết nối server trên Header.
  - [x] 6. Cập nhật kịch bản khởi động/tắt máy (`run.bat`, `stop.bat`) để hỗ trợ Graceful Shutdown và kiểm tra đầy đủ cổng 5173 / 5174.
  - [x] 7. Kiểm thử tổng thể qua browser subagent (không có lỗi console, giao diện phản hồi mượt mà, đầy đủ các nút chức năng).
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
