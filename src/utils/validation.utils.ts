import { Request, Response, NextFunction } from 'express'
import { validationResult, ValidationChain } from 'express-validator'
import { EntityError, ErrorWithStatus } from './error.utils';
import HTTP_STATUS_CODES from '~/core/statusCodes';
// import { RunnableValidationChains } from 'express-validator/lib/middlewares/schema'

// sequential processing, stops running validations chain if the previous one fails.
export const validate = (validations: ValidationChain[]) => {
    return async (req: Request, res: Response, next: NextFunction) => {

        for (const validation of validations) {
            await validation.run(req);
        }

        const errors = validationResult(req)

        if (errors.isEmpty()) {
            return next()
        }

        const errorObjects = errors.mapped()
        const entityError = new EntityError({ errors: {} })
        for (const key in errorObjects) {
            const { msg } = errorObjects[key]
            if (msg instanceof ErrorWithStatus && msg.status !== HTTP_STATUS_CODES.UNPROCESSABLE_ENTITY) {
                return next(msg)
            }
            entityError.errors[key] = errorObjects[key]
        }

        next(entityError)
    }
}
