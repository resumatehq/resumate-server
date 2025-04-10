import { HTTP_STATUS_CODES, REASON_PHRASES } from './httpStatusCode'

interface ErrorResponseParams {
  message?: string
  statusCode?: number
  reasonStatusCode?: string
  data?: any
}

class ErrorResponse {
  message: string
  status: number
  data: any

  constructor({ message, statusCode, reasonStatusCode, data = null }: ErrorResponseParams) {
    this.message = message || reasonStatusCode || 'Unknown error'
    this.status = statusCode || HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR
    this.data = data
  }

  send(res: any, headers: Record<string, string> = {}) {
    res.status(this.status).send(this)
  }
}

const createErrorResponse = (statusCode: number, reasonStatusCode: string) => {
  return class extends ErrorResponse {
    constructor({ message, data }: { message?: string; data?: any }) {
      super({ message, statusCode, reasonStatusCode, data })
    }
  }
}

// Định nghĩa các lỗi HTTP cụ thể
const BAD_REQUEST = createErrorResponse(HTTP_STATUS_CODES.BAD_REQUEST, REASON_PHRASES.BAD_REQUEST)
const UNAUTHORIZED = createErrorResponse(HTTP_STATUS_CODES.UNAUTHORIZED, REASON_PHRASES.UNAUTHORIZED)
const NOT_FOUND = createErrorResponse(HTTP_STATUS_CODES.NOT_FOUND, REASON_PHRASES.NOT_FOUND)
const FORBIDDEN = createErrorResponse(HTTP_STATUS_CODES.FORBIDDEN, REASON_PHRASES.FORBIDDEN)
const INTERNAL_SERVER_ERROR = createErrorResponse(HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR, REASON_PHRASES.INTERNAL_SERVER_ERROR)
export { ErrorResponse, BAD_REQUEST, UNAUTHORIZED, NOT_FOUND, FORBIDDEN , INTERNAL_SERVER_ERROR }
