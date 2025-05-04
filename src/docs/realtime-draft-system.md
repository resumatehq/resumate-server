# Hệ thống Draft Thời gian thực

## Tổng quan

Hệ thống Draft Thời gian thực là một giải pháp sử dụng WebSocket (Socket.IO) kết hợp với Redis để cung cấp khả năng lưu nháp (draft) tự động và làm việc cộng tác trong quá trình tạo resume. Hệ thống này giúp:

1. **Tự động lưu dữ liệu khi nhập** - Giúp tránh mất dữ liệu do tắt trình duyệt hoặc mất kết nối
2. **Làm việc đa thiết bị** - Đồng bộ dữ liệu giữa các thiết bị/tab của cùng người dùng
3. **Cộng tác thời gian thực** - Hiển thị ai đang chỉnh sửa phần nào của resume
4. **Phát hiện xung đột** - Thông báo khi nhiều người dùng chỉnh sửa cùng một phần

## Kiến trúc

```
┌─────────────┐       ┌─────────────┐      ┌─────────────┐
│  Frontend   │◄─────►│  Socket.IO  │◄────►│    Redis    │
│  React App  │       │   Server    │      │    Cache    │
└─────────────┘       └─────────┬───┘      └──────┬──────┘
                              ▲ │                 │
                              │ ▼                 ▼
                      ┌───────┴───────┐    ┌─────────────┐
                      │  REST API     │    │  MongoDB    │
                      │  Express      │◄───►│  Database   │
                      └───────────────┘    └─────────────┘
```

### Thành phần chính:

1. **Socket.IO Server** (`src/socket/draft.socket.ts`)

   - Xử lý các kết nối WebSocket từ client
   - Triển khai xác thực và phân quyền
   - Quản lý các phòng (rooms) cho từng resume
   - Phát hiện xung đột và thông báo

2. **Redis Cache** (`src/config/redis.ts`)

   - Lưu trữ dữ liệu draft tạm thời với hiệu suất cao
   - Giảm tải cho MongoDB khi có nhiều người dùng
   - Hỗ trợ TTL (Time-To-Live) tự động xóa draft cũ

3. **Quản lý Socket** (`src/socket/index.ts`)

   - Khởi tạo và cấu hình Socket.IO
   - Quản lý các socket namespace
   - Theo dõi kết nối của người dùng

4. **Middleware Xác thực** (`src/socket/auth-middleware.ts`)
   - Xác thực token JWT cho kết nối socket
   - Phân quyền cho từng phòng và tài nguyên

## Hoạt động của hệ thống

### 1. Quy trình lưu draft:

```
┌──────────┐     ┌───────────┐     ┌───────────┐     ┌──────────┐     ┌──────────┐
│          │     │           │     │           │     │          │     │          │
│  Client  │────►│ WebSocket │────►│   Redis   │────►│ MongoDB  │────►│  Client  │
│  Typing  │     │ Debounce  │     │   Cache   │     │ Database │     │ Feedback │
│          │     │           │     │           │     │          │     │          │
└──────────┘     └───────────┘     └───────────┘     └──────────┘     └──────────┘
```

1. Người dùng nhập nội dung
2. Client gửi sự kiện `draft_content_change` qua Socket.IO
3. Server debounce (chờ 2s từ lần nhập cuối) để giảm số lượng lưu
4. Lưu vào Redis cache trước (nhanh)
5. Sau đó lưu vào MongoDB (bền vững)
6. Gửi phản hồi về client xác nhận đã lưu
7. Thông báo cho các client khác của cùng resume

### 2. Phát hiện xung đột:

```
┌──────────┐     ┌───────────┐     ┌───────────┐     ┌──────────┐
│  User A  │     │ WebSocket │     │ Conflict  │     │  User B  │
│ Editing  │────►│  Server   │────►│ Detection │────►│ Notified │
│ Section  │     │           │     │           │     │          │
└──────────┘     └───────────┘     └───────────┘     └──────────┘
```

1. Định kỳ (5s) server kiểm tra xung đột
2. Nếu phát hiện nhiều người dùng đang chỉnh sửa cùng section
3. Thông báo đến tất cả người dùng liên quan
4. Vẫn cho phép chỉnh sửa, nhưng cảnh báo để người dùng phối hợp

## Cấu hình và Mở rộng

### Cấu hình hệ thống

Các tham số cấu hình chính trong `src/socket/draft.socket.ts`:

```typescript
private DRAFT_SAVE_DELAY = 2000;        // Độ trễ trước khi lưu draft (ms)
private CONFLICT_CHECK_INTERVAL = 5000; // Chu kỳ kiểm tra xung đột (ms)
```

Cấu hình Redis trong `src/config/redis.ts`:

- TTL cho dữ liệu draft: 3600 giây (1 giờ)
- TTL cho dữ liệu phiên: Theo cấu hình

### Mở rộng tính năng

Để mở rộng hệ thống, có thể xem xét các hướng sau:

1. **Thêm namespace mới**:

   ```typescript
   // Trong src/socket/index.ts
   const notificationNamespace = this.io.of('/notifications')
   notificationNamespace.use(socketAuthMiddleware)
   // Khởi tạo handler mới
   ```

2. **Thêm loại sự kiện mới**:

   ```typescript
   // Trong lớp xử lý socket
   socket.on('new_event_type', async (data) => {
     // Xử lý sự kiện mới
   })
   ```

3. **Tích hợp với dịch vụ bên thứ ba**:
   - Có thể gửi thông báo qua email/SMS khi có xung đột nghiêm trọng
   - Tích hợp với các dịch vụ thông báo đẩy (push notification)

## Gỡ lỗi & Bảo mật

### Gỡ lỗi

1. **Theo dõi logs**:

   - Sử dụng `logger.debug()` để ghi thông tin chi tiết
   - Theo dõi `logger.error()` để phát hiện vấn đề

2. **Socket.IO Admin UI**:
   - Truy cập bảng điều khiển quản trị Socket.IO qua https://admin.socket.io
   - Chỉ được kích hoạt trong môi trường phát triển

### Bảo mật

1. **Xác thực JWT**:

   - Mỗi kết nối socket phải có token JWT hợp lệ
   - Thông tin người dùng được lưu trong `socket.data`

2. **Quản lý phòng**:

   - Kiểm tra quyền truy cập vào mỗi phòng resume
   - Người dùng chỉ có thể tham gia các phòng mà họ có quyền

3. **Rate Limiting**:

   - Giới hạn số lượng sự kiện mỗi giây từ một client
   - Phát hiện hành vi bất thường

4. **Trả về lỗi an toàn**:
   - Không hiển thị thông tin lỗi chi tiết cho client
   - Sử dụng mã lỗi chung chung

## Tài liệu tham khảo

1. [Socket.IO Documentation](https://socket.io/docs/v4/)
2. [Redis Documentation](https://redis.io/documentation)
3. [Tutorial: Building Realtime Apps](https://socket.io/get-started/chat)
4. [JWT Authentication Best Practices](https://auth0.com/blog/10-best-practices-for-implementing-auth0/)

## Kết luận

Hệ thống Draft Thời gian thực cung cấp trải nghiệm người dùng mượt mà và bảo vệ dữ liệu người dùng khỏi việc mất mát. Việc kết hợp Socket.IO với Redis tạo ra một giải pháp hiệu suất cao, có khả năng mở rộng và đáng tin cậy cho việc lưu dữ liệu tự động khi người dùng đang nhập.
