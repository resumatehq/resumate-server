import { Router } from 'express'
import authRouters from './auth.routes'
import usersRouters from './user.routes'
import resumeRoutes from './resume.routes'
import templateRoutes from './template.routes'

const rootRouterV1 = Router()

rootRouterV1.use('/auth', authRouters)
rootRouterV1.use('/users', usersRouters)
rootRouterV1.use('/resumes', resumeRoutes)
rootRouterV1.use('/templates', templateRoutes)

export default rootRouterV1
