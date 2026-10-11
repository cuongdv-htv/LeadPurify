---
name: Memory and Context Rules
description: Quy tắc để AI luôn cập nhật và sử dụng context.md và memory.md
---

# Quy tắc sử dụng context.md và memory.md

Khi làm việc với dự án này, AI phải tuân thủ các quy tắc sau liên quan đến việc duy trì và sử dụng ngữ cảnh dự án:

1. **Luôn đọc trước khi thực hiện các thay đổi lớn**:
   - Trước khi bắt đầu một tính năng mới, sửa một lỗi phức tạp hoặc thiết kế kiến trúc, hãy đảm bảo rằng bạn đã đọc và hiểu nội dung của [`context.md`](../../../context.md) và [`memory.md`](../../../memory.md).

2. **Cập nhật `context.md`**:
   - Khi có thêm thông tin mới về kiến trúc, tài liệu API, luồng nghiệp vụ, hoặc các thay đổi lớn về yêu cầu hệ thống, hãy đề xuất cập nhật file `context.md`.
   - File này dùng để lưu trữ các tài liệu tĩnh và kiến thức chung về toàn bộ dự án.

3. **Cập nhật `memory.md`**:
   - Bất cứ khi nào bạn (AI) hoặc User phát hiện ra một quy ước mới (ví dụ: quy ước đặt tên, quy ước viết test), một lỗi hay gặp, một cách xử lý (workaround) cụ thể cho dự án này, hãy chủ động ghi vào `memory.md`.
   - File này giống như bộ nhớ ngắn hạn/dài hạn chứa các "bài học rút ra" và "quy ước lập trình" để tránh lặp lại sai lầm.

4. **Trích dẫn khi cần thiết**:
   - Khi giải thích một quyết định lập trình dựa trên các quy ước đã thống nhất, hãy nhắc lại rằng quyết định đó tuân theo những gì đã được ghi trong `memory.md` hoặc `context.md`.
