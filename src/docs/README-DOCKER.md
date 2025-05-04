# Hướng dẫn chạy Resumate Server trên Docker

## Yêu cầu

- Docker Desktop đã cài đặt
- Docker Compose đã cài đặt

## Cách chạy

### 1. Clone repository

```bash
git clone <repository-url>
cd resumate-server
```

### 2. Chạy ứng dụng

```bash
docker-compose up -d
```

Lệnh này sẽ:

- Tạo và chạy container Redis
- Build và chạy container Backend ở chế độ development

### 3. Kiểm tra ứng dụng đang chạy

```bash
docker ps
```

### 4. Xem logs của backend

```bash
docker logs resumate-server
```

## Thông tin kết nối

### Backend API

- URL: http://localhost:8080

### Redis

- Host: localhost (hoặc IP máy host)
- Port: 6379
- Password: resumate123

## Quản lý Redis

### Dùng Redis CLI

```bash
docker exec -it resumate-redis redis-cli -a resumate123
```

### Dùng Redis Insight

1. Tải và cài đặt [Redis Insight](https://redis.com/redis-enterprise/redis-insight/)
2. Kết nối với thông tin:
   - Host: localhost
   - Port: 6379
   - Password: resumate123
   - **LƯU Ý**: Để trống Username (không cần)

## Quản lý Docker Containers

### Dừng containers

```bash
docker-compose stop
```

### Khởi động lại containers

```bash
docker-compose start
```

### Dừng và xóa containers

```bash
docker-compose down
```

### Dừng, xóa containers và volumes (xóa dữ liệu)

```bash
docker-compose down -v
```

## Logs

### Xem logs của Backend

```bash
docker logs resumate-server
```

### Xem logs của Redis

```bash
docker logs resumate-redis
```

### Xem logs của cả hai service

```bash
docker-compose logs
```

## Truy cập shell của container

### Backend

```bash
docker exec -it resumate-server sh
```

### Redis

```bash
docker exec -it resumate-redis sh
```

## Xử lý lỗi

### Redis Insight không kết nối

- Đảm bảo bỏ trống trường Username
- Nhập chính xác password: resumate123
- Host: localhost (hoặc 127.0.0.1)

### Backend không chạy

- Kiểm tra logs: `docker logs resumate-server`
- Đảm bảo Redis đang chạy: `docker logs resumate-redis`
