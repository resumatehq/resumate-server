# Hướng dẫn sử dụng Socket.IO cho chức năng Draft

## Tổng quan

WebSocket được sử dụng để cung cấp khả năng lưu dữ liệu draft theo thời gian thực và đồng bộ giữa nhiều thiết bị/tab. Socket.IO đảm nhiệm việc tự động lưu dữ liệu khi người dùng đang nhập, giảm số lượng HTTP requests và cải thiện trải nghiệm người dùng.

## Cài đặt ở Client

Để sử dụng chức năng socket ở phía client, hãy thực hiện các bước sau:

1. Cài đặt Socket.IO client:

```bash
npm install socket.io-client
```

2. Thiết lập kết nối socket:

```typescript
import { io } from 'socket.io-client'

// Tạo kết nối socket
const socket = io('http://your-server-url/draft', {
  transports: ['websocket', 'polling'],
  withCredentials: true
})

// Xác thực người dùng
socket.on('connect', () => {
  socket.emit('authenticate', {
    userId: 'user-id-from-auth',
    token: 'jwt-token-from-auth'
  })
})

// Lắng nghe kết quả xác thực
socket.on('authenticated', (data) => {
  console.log('Socket authenticated:', data.success)
})

// Xử lý lỗi xác thực
socket.on('authentication_required', () => {
  // Yêu cầu người dùng đăng nhập lại
})

socket.on('unauthorized', (data) => {
  console.error('Unauthorized socket access:', data.message)
})
```

## Sử dụng chức năng Draft

### 1. Bắt đầu chỉnh sửa section

Khi người dùng bắt đầu chỉnh sửa một section, gọi:

```typescript
socket.emit('start_editing_section', {
  resumeId: 'resume-id',
  userId: 'user-id',
  sectionType: 'personal' // hoặc education, experience, etc.
})
```

### 2. Lưu draft khi người dùng đang nhập

```typescript
// Gắn vào onChange của form/editor
function handleContentChange(newContent) {
  socket.emit('draft_content_change', {
    resumeId: 'resume-id',
    userId: 'user-id',
    sectionType: 'personal',
    sectionData: newContent,
    resumeData: {
      // Nếu là lần đầu tạo resume, gửi thêm thông tin cơ bản
      title: 'Resume Title',
      templateId: 'template-id'
      // Các thông tin khác...
    }
  })
}
```

### 3. Hiển thị trạng thái lưu

```typescript
// Đang lưu
socket.on('draft_saving', (data) => {
  showSavingStatus(`Đang lưu... (${data.sectionType})`)
})

// Đã lưu thành công
socket.on('draft_saved', (data) => {
  showSavedStatus(`Đã lưu lúc ${formatTime(data.timestamp)}`)
})

// Lỗi khi lưu
socket.on('draft_save_error', (data) => {
  showErrorStatus(`Lỗi: ${data.error}`)
})
```

### 4. Tải dữ liệu draft khi mở section

```typescript
// Yêu cầu tải draft
socket.emit('load_section_draft', {
  resumeId: 'resume-id',
  userId: 'user-id',
  sectionType: 'personal'
})

// Nhận dữ liệu draft
socket.on('section_draft_loaded', (data) => {
  if (data.draftData) {
    // Điền dữ liệu vào form
    populateFormWithDraftData(data.draftData)
    showLastSavedTime(data.timestamp)
  } else {
    // Không có dữ liệu draft, sử dụng dữ liệu từ server nếu có
  }
})
```

### 5. Hiển thị người dùng khác đang chỉnh sửa

```typescript
// Người khác bắt đầu chỉnh sửa
socket.on('section_editing_started', (data) => {
  showOtherUserEditing(data.sectionType, data.userId)
})

// Người khác dừng chỉnh sửa
socket.on('section_editing_stopped', (data) => {
  hideOtherUserEditing(data.sectionType, data.userId)
})

// Người khác đã cập nhật draft
socket.on('draft_updated', (data) => {
  showNotification(`Section ${data.sectionType} vừa được cập nhật bởi người dùng khác`)
})
```

### 6. Kết thúc chỉnh sửa

```typescript
function finishEditing(shouldSave = true) {
  socket.emit('stop_editing_section', {
    resumeId: 'resume-id',
    userId: 'user-id',
    sectionType: 'personal',
    save: shouldSave // true: giữ lại draft, false: có thể xóa draft
  })

  // Nếu cần save & continue, gọi API riêng
  if (shouldSave) {
    saveSectionThroughAPI()
  }
}

// Hàm gọi API save & continue
async function saveSectionThroughAPI() {
  try {
    const response = await fetch('/api/v1/resumes/sections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resumeId: 'resume-id', // Có thể null nếu tạo mới
        sectionData: getSectionData(),
        resumeData: getResumeMetadata() // Nếu cần
      })
    })
    const result = await response.json()
    // Xử lý kết quả
  } catch (error) {
    console.error('Error saving section:', error)
  }
}
```

## Ví dụ hoàn chỉnh trong React

```jsx
import React, { useEffect, useState } from 'react'
import { io } from 'socket.io-client'
import { useAuth } from './your-auth-context'

function ResumeEditor({ resumeId, sectionType }) {
  const [content, setContent] = useState({})
  const [saveStatus, setSaveStatus] = useState('')
  const [otherEditors, setOtherEditors] = useState([])
  const { user } = useAuth()
  const [socket, setSocket] = useState(null)

  useEffect(() => {
    // Khởi tạo socket
    const newSocket = io(process.env.REACT_APP_API_URL + '/draft', {
      transports: ['websocket', 'polling'],
      withCredentials: true
    })

    // Xác thực
    newSocket.on('connect', () => {
      newSocket.emit('authenticate', {
        userId: user.id,
        token: user.token
      })
    })

    // Xử lý các sự kiện
    newSocket.on('authenticated', handleAuthenticated)
    newSocket.on('draft_saving', handleDraftSaving)
    newSocket.on('draft_saved', handleDraftSaved)
    newSocket.on('draft_save_error', handleDraftError)
    newSocket.on('section_draft_loaded', handleDraftLoaded)
    newSocket.on('section_editing_started', handleOtherEditorJoined)
    newSocket.on('section_editing_stopped', handleOtherEditorLeft)

    setSocket(newSocket)

    // Cleanup
    return () => {
      if (newSocket) {
        newSocket.emit('stop_editing_section', {
          resumeId,
          userId: user.id,
          sectionType,
          save: true
        })
        newSocket.disconnect()
      }
    }
  }, [resumeId, sectionType, user])

  // Khi component mount, bắt đầu chỉnh sửa và tải draft
  useEffect(() => {
    if (socket && socket.connected) {
      // Thông báo bắt đầu chỉnh sửa
      socket.emit('start_editing_section', {
        resumeId,
        userId: user.id,
        sectionType
      })

      // Tải draft data
      socket.emit('load_section_draft', {
        resumeId,
        userId: user.id,
        sectionType
      })
    }
  }, [socket, resumeId, sectionType, user])

  // Xử lý các sự kiện socket
  const handleAuthenticated = (data) => {
    console.log('Socket authenticated:', data.success)
  }

  const handleDraftSaving = () => {
    setSaveStatus('Đang lưu...')
  }

  const handleDraftSaved = (data) => {
    setSaveStatus(`Đã lưu lúc ${new Date(data.timestamp).toLocaleTimeString()}`)
  }

  const handleDraftError = (data) => {
    setSaveStatus(`Lỗi: ${data.error}`)
  }

  const handleDraftLoaded = (data) => {
    if (data.draftData) {
      setContent(data.draftData)
    }
  }

  const handleOtherEditorJoined = (data) => {
    setOtherEditors((prev) => [...prev, data.userId])
  }

  const handleOtherEditorLeft = (data) => {
    setOtherEditors((prev) => prev.filter((id) => id !== data.userId))
  }

  // Xử lý thay đổi nội dung
  const handleContentChange = (newContent) => {
    setContent(newContent)

    if (socket && socket.connected) {
      socket.emit('draft_content_change', {
        resumeId,
        userId: user.id,
        sectionType,
        sectionData: newContent
      })
    }
  }

  // Lưu và tiếp tục
  const handleSaveAndContinue = async () => {
    try {
      const response = await fetch(`/api/v1/resumes/${resumeId || 'sections'}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user.token}`
        },
        body: JSON.stringify({
          resumeId,
          sectionData: content,
          resumeData: !resumeId
            ? {
                title: 'My Resume',
                templateId: 'default-template'
              }
            : undefined
        })
      })

      const result = await response.json()
      // Xử lý kết quả API

      // Dừng chỉnh sửa qua socket
      if (socket && socket.connected) {
        socket.emit('stop_editing_section', {
          resumeId: result.data.resumeId || resumeId,
          userId: user.id,
          sectionType,
          save: false // Đã lưu qua API nên không cần giữ draft
        })
      }

      // Chuyển đến section tiếp theo
      navigateToNextSection(result.data.resumeId)
    } catch (error) {
      console.error('Error saving section:', error)
    }
  }

  return (
    <div className='resume-editor'>
      <div className='editor-header'>
        <h2>Edit {sectionType} Section</h2>
        <div className='save-status'>{saveStatus}</div>
        {otherEditors.length > 0 && (
          <div className='collaborative-indicator'>{otherEditors.length} người khác đang chỉnh sửa</div>
        )}
      </div>

      {/* Form chỉnh sửa section */}
      <form>
        {/* Hiển thị các trường tùy thuộc vào loại section */}
        {/* ... */}

        <button type='button' onClick={handleSaveAndContinue}>
          Save & Continue
        </button>
      </form>
    </div>
  )
}

export default ResumeEditor
```
