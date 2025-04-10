import { Request, Response, NextFunction, RequestHandler } from 'express'

// Sử dụng RequestHandler từ express
export const wrapRequestHandler = (fn: Function): RequestHandler => {
    return (req: Request, res: Response, next: NextFunction) => {
        Promise.resolve(fn(req, res, next)).catch((err) => {
            console.error('Error caught in wrapRequestHandler:', err)
            next(err)
        })
    }
}
