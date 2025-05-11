# Hướng dẫn kết nối Redis cho Frontend

## Thông tin kết nối Redis

Đây là thông tin Redis server được chia sẻ trong nhóm, giúp bạn không cần cài đặt toàn bộ backend:

```
Host: 192.168.0.179
Port: 6379
Password: resumate123
```

## Cách kết nối trong code Frontend

### Sử dụng thư viện ioredis:

```typescript
import Redis from 'ioredis'

const redis = new Redis({
  host: '192.168.0.179',
  port: 6379,
  password: 'resumate123'
})

// Sử dụng Redis
redis.set('key', 'value')
redis.get('key').then((result) => console.log(result))
```

## Lưu ý quan trọng

1. Địa chỉ IP sẽ là IP của người chạy Docker server (không phải localhost cho người dùng từ xa)
2. Đảm bảo port 6379 được mở trên firewall của máy chủ
3. Redis server đang được cấu hình với persistent storage nên dữ liệu sẽ được lưu trữ ngay cả khi container khởi động lại

## Cách kiểm tra kết nối

Cài đặt Redis CLI hoặc sử dụng Redis Insight để kiểm tra:

```bash
redis-cli -h [IP của máy chủ] -p 6379 -a resumate123 ping
```

Nếu nhận được phản hồi `PONG`, kết nối đã thành công.
