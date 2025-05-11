# Access Control Middlewares

This directory contains middlewares for both Role-Based Access Control (RBAC) and Attribute-Based Access Control (ABAC) in the Resumate application.

## Role-Based Access Control (RBAC)

The RBAC system uses the AccessControl library to define permissions based on roles:

- `free`: Basic user with limited access
- `premium`: Premium user with enhanced access
- `admin`: System administrator with full access

Roles and permissions are defined in `/src/config/roles.ts`.

## Attribute-Based Access Control (ABAC)

The ABAC system extends RBAC with additional attribute-based conditions like:

- Resource ownership (e.g., "user can only edit their own templates")
- Resource tier level (e.g., "only premium users can access premium templates")
- Subscription status (e.g., "user must have an active subscription")

### ABAC Middlewares

#### General ABAC Middleware

The `checkAttributeBasedAccess` middleware allows checking permissions based on:

1. Resource type (template, resume, etc.)
2. Action (create, read, update, delete)
3. Attribute conditions (ownership, resource tier, subscription status)

#### Specialized ABAC Middlewares

For common scenarios, we provide specialized middlewares:

1. `checkTemplateAccess(action)`: Verifies if a user can access a specific template based on:

   - If they own the template (for update/delete)
   - If the template is premium (only premium users can access)
   - If they have an active subscription (for update/delete)

2. `checkResumeAccess(action)`: Verifies if a user can access a specific resume based on:
   - If they own the resume

### Using ABAC Middlewares

Example of protecting routes with ABAC:

```javascript
// Template routes with ABAC
router.get('/:id', accessTokenValidation, checkTemplateAccess('read'), templateController.getTemplateById)

router.put(
  '/:id',
  accessTokenValidation,
  checkTemplateAccess('update'), // Only owner can update
  templateController.updateTemplate
)

router.delete(
  '/:id',
  accessTokenValidation,
  checkTemplateAccess('delete'), // Only owner can delete
  templateController.deleteTemplate
)
```

### Attribute Conditions

The conditions are defined in `/src/config/roles.ts` as `ATTRIBUTE_CONDITIONS`:

- `OWN_RESOURCE`: Check if user owns the resource
- `FREE_TEMPLATE`: Check if it's a free template
- `PREMIUM_TEMPLATE`: Check if it's a premium template
- `ACTIVE_SUBSCRIPTION`: Check if user has active subscription

# Middleware Access Control

Trong project này, chúng ta đã tổng hợp tất cả các middleware liên quan đến kiểm soát quyền truy cập vào một file thống nhất `access-control.middleware.ts`. File này chứa các middleware cần thiết để:

1. Kiểm tra quyền truy cập tính năng dựa trên vai trò (role)
2. Kiểm tra quyền truy cập dựa trên subscription
3. Kiểm tra giới hạn sử dụng (usage limits)
4. Theo dõi việc sử dụng tính năng (usage tracking)

## Các Middleware Có Sẵn

### `checkFeatureAccess(feature: string)`

Middleware chính để kiểm tra quyền truy cập tính năng. Nó kết hợp:

- Kiểm tra vai trò (role) sử dụng AccessControl
- Kiểm tra subscription có active không
- Kiểm tra feature có trong danh sách allowedFeatures không
- Kiểm tra giới hạn sử dụng nếu là tính năng AI
- Ghi log truy cập nếu là tính năng premium

```javascript
import { checkFeatureAccess } from '~/middlewares/access-control.middleware'
import { FEATURES } from '~/config/roles'

// Sử dụng trong route
router.get('/some-route', checkFeatureAccess(FEATURES.BASIC_EDITOR), (req, res) => {
  /* handler */
})
```

### `checkRolePermission(feature: string)`

Phiên bản đơn giản hơn của `checkFeatureAccess`, chỉ kiểm tra quyền dựa trên vai trò (role).

```javascript
import { checkRolePermission } from '~/middlewares/access-control.middleware'
import { FEATURES } from '~/config/roles'

router.get('/some-route', checkRolePermission(FEATURES.BASIC_EDITOR), (req, res) => {
  /* handler */
})
```

### `requirePremium`

Middleware kiểm tra người dùng có gói premium active không.

```javascript
import { requirePremium } from '~/middlewares/access-control.middleware'

router.get('/premium-route', requirePremium, (req, res) => {
  /* handler */
})
```

### `checkResumeLimit`

Kiểm tra xem người dùng đã đạt giới hạn tạo resume chưa.

```javascript
import { checkResumeLimit } from '~/middlewares/access-control.middleware'

router.post('/resumes', checkResumeLimit, (req, res) => {
  /* handler */
})
```

### `checkExportAccess(format: string)`

Kiểm tra quyền xuất file theo định dạng.

```javascript
import { checkExportAccess } from '~/middlewares/access-control.middleware'

router.get('/export/pdf', checkExportAccess('pdf'), (req, res) => {
  /* handler */
})
```

### `trackFeatureUsage(counter: string)`

Theo dõi việc sử dụng tính năng và tăng counter tương ứng.

```javascript
import { trackFeatureUsage } from '~/middlewares/access-control.middleware'

router.post('/resumes', trackFeatureUsage('createdResumes'), (req, res) => {
  /* handler */
})
```

### `checkSectionAccess(sectionType: string)`

Kiểm tra quyền truy cập vào loại section.

```javascript
import { checkSectionAccess } from '~/middlewares/access-control.middleware'

router.post('/sections/custom', checkSectionAccess('custom'), (req, res) => {
  /* handler */
})
```

## Thông tin Truy Cập

Middleware này đặt thông tin người dùng vào `req.user` để các handler có thể sử dụng.

```javascript
router.get('/profile', checkFeatureAccess(FEATURES.BASIC_EDITOR), (req, res) => {
  const user = req.user
  // Sử dụng thông tin user
  res.json({ data: user })
})
```

## Cấu hình Quyền

Các quyền được định nghĩa trong file `src/config/roles.ts` với hai thành phần chính:

1. `FEATURES`: Danh sách các tính năng của hệ thống
2. `ac`: Đối tượng AccessControl xác định quyền cho từng vai trò
