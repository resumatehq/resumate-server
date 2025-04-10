import { Router } from 'express'
import authRouters from './auth.routes'
import usersRouters from './user.routes'

const rootRouterV1 = Router()

rootRouterV1.use('/auth', authRouters)
rootRouterV1.use('/users', usersRouters)

export default rootRouterV1
