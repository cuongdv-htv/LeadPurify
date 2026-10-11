---
name: Task Management Rules
description: Quy tắc yêu cầu AI phải lên plan và ghi task vào task.md trước khi viết code.
---

# Quy tắc Quản lý Task (task.md)

Khi làm việc với dự án này, AI phải tuân thủ nghiêm ngặt quy tắc sau đây trước khi thực hiện bất kỳ việc viết mã (implement) hay thay đổi quan trọng nào:

1. **Bắt buộc viết Task trước khi Code**:
   - TRƯỚC KHI thực hiện (implement) code cho bất kỳ tính năng mới, thay đổi kiến trúc hoặc sửa lỗi phức tạp nào, AI phải MỞ và CHỈNH SỬA file [`task.md`](../../../task.md).
   - AI cần phải viết rõ danh sách các bước cần thực hiện (to-do list) vào phần "Các Task Đang Thực Hiện" trong `task.md`.

2. **Cập nhật trạng thái Task**:
   - Quá trình thực hiện chia thành từng bước nhỏ. Hoàn thành bước nào, AI chủ động đánh dấu `[x]` cho task đó trong `task.md`.

3. **Mục đích**:
   - Việc này giúp User và AI đồng bộ được quy trình, theo dõi tiến độ một cách rõ ràng và tránh bỏ sót các yêu cầu trong quá trình thực hiện.
