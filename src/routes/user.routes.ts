import { Router } from 'express'
import userController from '~/controllers/user.controller'
import { accessTokenValidation } from '~/middlewares/auth.middlewares'
import { wrapRequestHandler } from '~/utils/wrapHandler'
import { generalRateLimiter } from '~/middlewares/rate-limiter.middleware'
import { validateProfileUpdate, validateSubscriptionUpgrade } from '~/middlewares/user.middleware'

const usersRouters = Router()

usersRouters.use(accessTokenValidation)

// Profile routes
usersRouters.get('/profile', generalRateLimiter(20, 60 * 1000), wrapRequestHandler(userController.getProfile))
usersRouters.put('/profile',
    generalRateLimiter(10, 60 * 1000),
    validateProfileUpdate,
    wrapRequestHandler(userController.updateProfile)
)

// Search routes
usersRouters.get('/search', generalRateLimiter(15, 60 * 1000), wrapRequestHandler(userController.searchUserByEmail))

// Getting user features
usersRouters.get('/features',
    generalRateLimiter(15, 60 * 1000),
    wrapRequestHandler(userController.getUserFeatures)
)

// Subscription management
usersRouters.post('/subscription/upgrade',
    generalRateLimiter(5, 60 * 1000),
    validateSubscriptionUpgrade,
    wrapRequestHandler(userController.upgradeToPremium)
)

usersRouters.post('/subscription/cancel-renewal',
    generalRateLimiter(5, 60 * 1000),
    wrapRequestHandler(userController.cancelAutoRenewal)
)

usersRouters.post('/subscription/enable-renewal',
    generalRateLimiter(5, 60 * 1000),
    wrapRequestHandler(userController.enableAutoRenewal)
)

usersRouters.get('/subscription/status',
    generalRateLimiter(10, 60 * 1000),
    wrapRequestHandler(userController.getSubscriptionStatus)
)

export default usersRouters