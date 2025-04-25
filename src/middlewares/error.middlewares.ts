import { ErrorRequestHandler } from 'express'
import { omit } from 'lodash'
import HTTP_STATUS_CODES from '~/core/statusCodes'
import { logger } from '~/loggers/my-logger.log'
import { ErrorWithStatus } from '~/utils/error.utils'

// Định nghĩa rõ kiểu là ErrorRequestHandler
export const defaultErrorHandler: ErrorRequestHandler = (err, req, res, next) => {
  const requestInfo = {
    method: req.method,
    originalUrl: req.originalUrl,
    params: req.params,
    body: omit(req.body, ['password', 'confirmPassword']), // Loại bỏ các field nhạy cảm
    query: req.query,
    userIP: req.ip || req.socket.remoteAddress
  }

  logger.error(
    err.message,
    'ErrorHandler', // Tên của service/context
    Array.isArray(req.headers['x-request-id']) ? req.headers['x-request-id'][0] : req.headers['x-request-id'] || 'NO_REQUEST_ID', // requestId
    {
      errorName: err.name,
      errorStack: err.stack,
      status: err instanceof ErrorWithStatus ? err.status : HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR,
      requestInfo
    }
  )

  if (err instanceof ErrorWithStatus) {
    res.status(err.status).json(omit(err, 'status'))
    return
  }

  Object.getOwnPropertyNames(err).forEach((key) => {
    Object.defineProperty(err, key, { enumerable: true })
  })

  res.status(HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR).json({
    message: err.message,
    errorInfo: omit(err, 'stack')
  })
  return
}
