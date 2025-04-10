import { Request, Response, NextFunction, ErrorRequestHandler } from 'express'
import { omit } from 'lodash'
import HTTP_STATUS_CODES from '~/core/statusCodes'
import { ErrorWithStatus } from '~/utils/error.utils'

// Định nghĩa rõ kiểu là ErrorRequestHandler
export const defaultErrorHandler: ErrorRequestHandler = (err, req, res, next) => {
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
