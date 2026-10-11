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
- `POST /api/queue/batch-resume`: Tiếp tục tất cả các tiến trình bị gián đoạn từ checkpoint.
- `POST /api/queue/trigger`: Kích hoạt worker xử lý hàng đợi nếu đang ở trạng thái nhàn rỗi.
- `POST /api/shutdown`: Graceful shutdown an toàn lưu checkpoint và đóng browser.
- `POST /api/clear-history`: Xóa lịch sử các tiến trình đã hoàn thành/hủy.
- `GET /api/download/:filename`: Tải xuống kết quả CSV đã phân loại (Sống, Chết, Hoạt động, Checkpoint một phần).

