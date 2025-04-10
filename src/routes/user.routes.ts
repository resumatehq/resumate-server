import { Router } from 'express'
import userController from '~/controllers/user.controller'
import { accessTokenValidation } from '~/middlewares/auth.middlewares'
import { wrapRequestHandler } from '~/utils/wrapHandler'

const usersRouters = Router()

usersRouters.get('/profile', accessTokenValidation, wrapRequestHandler(userController.getProfile))

usersRouters.get('/search', accessTokenValidation, wrapRequestHandler(userController.searchUserByEmail))

export default usersRouters