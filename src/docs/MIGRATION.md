# Kế hoạch Di chuyển Middleware

Chúng ta đang hợp nhất các middleware kiểm soát quyền truy cập thành một hệ thống thống nhất trong file `access-control.middleware.ts`.

## 1. Các File Cũ Được Thay Thế

Những file middleware sau sẽ bị **loại bỏ** và thay thế bằng `access-control.middleware.ts`:

- `~/middlewares/feature.middleware.ts`
- `~/middlewares/feature-access.middleware.ts`
- `~/middlewares/permission.middleware.ts`

## 2. Ánh xạ Function

| Function Cũ                                         | Function Mới          | Mô tả                                |
| --------------------------------------------------- | --------------------- | ------------------------------------ |
| `checkFeatureAccess` (auth.middlewares.ts)          | `checkRolePermission` | Chỉ kiểm tra quyền dựa trên role     |
| `checkPremiumFeature` (feature.middleware.ts)       | `checkFeatureAccess`  | Kiểm tra đầy đủ quyền truy cập       |
| `checkFeatureAccess` (feature-access.middleware.ts) | `checkFeatureAccess`  | Kiểm tra đầy đủ quyền truy cập       |
| `validatePermission` (permission.middleware.ts)     | `checkFeatureAccess`  | Kiểm tra đầy đủ quyền truy cập       |
| `requirePremium` (permission.middleware.ts)         | `requirePremium`      | Chức năng tương tự                   |
| `checkFeatureLimit` (permission.middleware.ts)      | `checkResumeLimit`    | Kiểm tra giới hạn tạo resume         |
| `trackFeatureUsage` (permission.middleware.ts)      | `trackFeatureUsage`   | Theo dõi việc sử dụng tính năng      |
| `checkResumeLimit` (feature-access.middleware.ts)   | `checkResumeLimit`    | Kiểm tra giới hạn tạo resume         |
| `checkSectionAccess` (feature-access.middleware.ts) | `checkSectionAccess`  | Kiểm tra quyền truy cập section      |
| `checkAiAccess` (feature-access.middleware.ts)      | `checkFeatureAccess`  | Được tích hợp vào checkFeatureAccess |
| `checkExportAccess` (feature-access.middleware.ts)  | `checkExportAccess`   | Kiểm tra quyền xuất file             |

## 3. Các bước cập nhật

1. Tạo file `access-control.middleware.ts` ✅
2. Cập nhật các route để sử dụng middleware mới (ví dụ: resume.routes.ts) ✅
3. Cập nhật các file còn lại tương tự
4. Thêm chỗ cho các tính năng truy vấn permissions vào Request (trong express.d.ts) ✅
5. Thêm file README.md với hướng dẫn sử dụng ✅

## 4. Cách cập nhật các route

Đối với mỗi file route đang sử dụng các middleware cũ:

1. Cập nhật import:

   ```typescript
   // Thay thế
   import { validatePermission } from '~/middlewares/permission.middleware'
   // Bằng
   import { checkFeatureAccess } from '~/middlewares/access-control.middleware'
   ```

2. Cập nhật sử dụng middleware:

   ```typescript
   // Thay thế
   router.get('/route', validatePermission(FEATURES.FEATURE_NAME, 'read'), ...)
   // Bằng
   router.get('/route', checkFeatureAccess(FEATURES.FEATURE_NAME), ...)
   ```

3. Đối với các tính năng của premium:

   ```typescript
   // Thay thế
   router.get('/premium-route', validatePermission(FEATURES.ADVANCED_FEATURE, 'read'), requirePremium, ...)
   // Bằng
   router.get('/premium-route', checkFeatureAccess(FEATURES.ADVANCED_FEATURE), requirePremium, ...)
   ```

4. Theo dõi việc sử dụng:
   ```typescript
   // Thay thế
   router.post('/create', trackFeatureUsage('createdResumes'), ...)
   // Giữ nguyên hoặc cập nhật nếu cần
   router.post('/create', trackFeatureUsage('createdResumes'), ...)
   ```

## 5. Lợi ích của cấu trúc mới

1. **Thống nhất**: Tất cả logic kiểm soát quyền truy cập ở một chỗ
2. **Dễ bảo trì**: Dễ dàng cập nhật và mở rộng
3. **Cải thiện hiệu suất**: Tận dụng Redis caching để tối ưu
4. **Thực tiễn tốt hơn**: Logic middleware rõ ràng và mạch lạc
5. **Hỗ trợ TypeScript**: Sửa các vấn đề với kiểu dữ liệu trong Request
