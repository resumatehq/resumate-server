import { Router } from 'express'
import authRouters from './auth.routes'
import usersRouters from './user.routes'
import resumeRoutes from './resume.routes'
import templateRoutes from './template.routes'
import aiRoutes from './ai.routes'
import exportRoutes from './export.routes'
import draftRouter from './draft.routes'

const rootRouterV1 = Router()

rootRouterV1.use('/auth', authRouters)
rootRouterV1.use('/users', usersRouters)
rootRouterV1.use('/resumes', resumeRoutes)
rootRouterV1.use('/templates', templateRoutes)
rootRouterV1.use('/drafts', draftRouter)
rootRouterV1.use('/ai', aiRoutes)
rootRouterV1.use('/export', exportRoutes)

export default rootRouterV1
