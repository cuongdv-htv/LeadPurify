# Project Context

Tệp này được sử dụng để lưu trữ các tài liệu, thông tin tổng quan, và ngữ cảnh liên quan đến dự án LeadPurify. 
Bất kỳ tài liệu tham khảo, API docs, cấu trúc cơ sở dữ liệu, hoặc kiến trúc hệ thống nào nên được ghi chép hoặc liên kết tại đây.

## Thông tin dự án
- Tên dự án: LeadPurify (Hệ thống xác thực liên kết và làm sạch dữ liệu khách hàng tiềm năng)
- Kiến trúc:
  - Backend: Node.js (Express, Socket.IO, Puppeteer, PapaParse, Multer) chạy cổng 3001.
  - Frontend: React + Vite + Framer Motion + Lucide React theo phong cách thiết kế Liquid Glass chạy cổng 5173/5174.
  - Cơ chế lưu trữ: File-based JSON (`queue.json`, `queue.json.bak`, `apify_keys.json`, `config.json`), Checkpoints trong thư mục `outputs/checkpoint_{jobId}.json`.

## Danh sách API Endpoints chính
- `POST /api/upload`: Nhận tệp CSV, cấu hình quét và đưa vào hàng đợi `PENDING`.
- `GET /api/queue`: Lấy danh sách hàng đợi tiến trình.
- `POST /api/queue/:id/:action`: Điều khiển tiến trình (`pause`, `resume`, `retry`, `cancel`, `remove`, `force`).
- `POST /api/queue/batch-retry`: Chạy lại toàn bộ các tiến trình bị lỗi/gián đoạn.
- `POST /api/queue/batch-resume`: Tiếp tục tất cả các tiến trình bị gián đoạn hoặc tạm dừng.
- `POST /api/queue/batch-pause`: Tạm dừng toàn bộ các tiến trình đang chạy và chờ trong hàng đợi.
- `POST /api/queue/batch-stop`: Dừng toàn bộ các tiến trình đang chạy/chờ trong hàng đợi và lưu kết quả một phần.
- `POST /api/queue/batch-clear`: Xóa toàn bộ các tiến trình trong hàng đợi và dọn dẹp các tệp liên quan.
- `POST /api/queue/trigger`: Kích hoạt worker xử lý hàng đợi nếu đang ở trạng thái nhàn rỗi.
- `POST /api/shutdown`: Graceful shutdown an toàn lưu checkpoint và đóng browser.
- `POST /api/clear-history`: Xóa lịch sử các tiến trình đã hoàn thành/hủy, đồng thời tự động xóa các tệp CSV kết quả trong `outputs/`, tệp gốc trong `uploads/` và các file mồ côi.
- `POST /api/clean-storage`: Quét và dọn dẹp tất cả các tệp mồ côi trong `outputs/` và `uploads/` không thuộc tiến trình nào đang hoạt động.
- `GET /api/download/:filename`: Tải xuống kết quả CSV đã phân loại (Sống, Chết, Hoạt động, Checkpoint một phần).
- `GET /api/download-batch-zip/:type`: Nén toàn bộ các file kết quả theo loại (`alive` hoặc `dead`) từ tất cả tiến trình trong lịch sử thành 1 file ZIP duy nhất.
- `POST /api/apify-keys/reset-usage`: Đặt lại lượt dùng về 0 và kích hoạt lại toàn bộ các API Token trong hệ thống.

