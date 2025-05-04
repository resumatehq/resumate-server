# Resume Sharing Feature - Postman Test Data

## Prerequisites

- You need to be logged in with a valid user account (have your access token)
- Replace the placeholder `{{access_token}}` with your actual token
- Replace `{{base_url}}` with your API base URL (e.g., http://localhost:3000/api/v1)

## 1. Create a Resume for Testing

**POST** `{{base_url}}/resumes`

**Headers:**

```
Authorization: Bearer {{access_token}}
Content-Type: application/json
```

**Body:**

```json
{
  "title": "Test Resume for Sharing",
  "templateId": "64a78d0cf5a7d3a789abcdef", // Replace with a valid template ID from your database
  "targetPosition": "Software Engineer",
  "industry": "Technology",
  "language": "en"
}
```

After creating the resume, save the returned resumeId for subsequent requests. Let's assume it's `{{resumeId}}`.

## 2. Share a Resume

**POST** `{{base_url}}/resumes/{{resumeId}}/share`

**Headers:**

```
Authorization: Bearer {{access_token}}
Content-Type: application/json
```

**Body:**

```json
{
  "password": "test123",
  "expiryDays": 30,
  "allowDownload": true,
  "allowFeedback": true,
  "allowEmbed": true
}
```

**Sample Response:**

```json
{
  "message": "Resume shared successfully",
  "status": 200,
  "metadata": {
    "timestamp": "2023-08-15T10:00:00.000Z"
  },
  "data": {
    "shareableLink": "http://example.com/r/abcde12345",
    "sharingOptions": {
      "password": "$2b$10$...",
      "expiresAt": "2023-09-15T10:00:00.000Z",
      "allowDownload": true,
      "allowFeedback": true,
      "allowEmbed": true
    }
  }
}
```

Save the `shareableLink` for testing the public access.

## 3. Update Share Settings

**PUT** `{{base_url}}/resumes/{{resumeId}}/share`

**Headers:**

```
Authorization: Bearer {{access_token}}
Content-Type: application/json
```

**Body:**

```json
{
  "password": "newpassword",
  "expiryDays": 15,
  "allowDownload": false,
  "allowFeedback": true,
  "allowEmbed": false
}
```

## 4. Generate QR Code

**GET** `{{base_url}}/resumes/{{resumeId}}/share/qrcode?size=400`

**Headers:**

```
Authorization: Bearer {{access_token}}
```

## 5. Access Public Resume (Without Password)

**GET** `{{base_url}}/resumes/shared/abcde12345` (Use the shareableLink suffix from step 2)

## 6. Access Public Resume (With Password)

**GET** `{{base_url}}/resumes/shared/abcde12345`

**Headers:**

```
Content-Type: application/json
```

**Body:**

```json
{
  "password": "newpassword"
}
```

## 7. Revoke Share Access

**DELETE** `{{base_url}}/resumes/{{resumeId}}/share`

**Headers:**

```
Authorization: Bearer {{access_token}}
```

## Testing Edge Cases

### 1. Try accessing an expired link

Set a very short expiry (e.g., 0.001 days = ~1.4 minutes) and try accessing after that time.

### 2. Try embedding a resume that doesn't allow embedding

Set `allowEmbed: false` and try accessing with a referrer header from another site.

**Headers for testing embedding restriction:**

```
Referer: https://someothersite.com
```

### 3. Try updating share settings for a resume that isn't shared yet

This should return a 400 error.

### 4. Access a resume with an incorrect password

This should return a 401 error.
