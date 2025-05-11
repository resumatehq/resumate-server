import { Router } from 'express'
import passport from 'passport'
import authController from '~/controllers/auth.controller';
import { accessTokenValidation, loginValidation, refreshTokenValidation, registerValidation } from '~/middlewares/auth.middlewares'
import { wrapRequestHandler } from '~/utils/wrapHandler'
import { generalRateLimiter, loginRateLimiter, registerRateLimiter, resendEmailRateLimiter } from '~/middlewares/rate-limiter.middleware'
import { uploadSingle } from '~/config/multer';
import { uploadMiddleware } from '~/middlewares/upload.middlware';

const authRoutes = Router();

authRoutes.post('/register',
  registerRateLimiter,
  uploadSingle('avatar'),
  uploadMiddleware,
  registerValidation,
  wrapRequestHandler(authController.register)
);

authRoutes.post('/login', loginRateLimiter, loginValidation, wrapRequestHandler(authController.login))

authRoutes.delete('/logout', accessTokenValidation, refreshTokenValidation, generalRateLimiter(10, 60 * 1000), wrapRequestHandler(authController.logout))

authRoutes.post('/refresh-token', refreshTokenValidation, generalRateLimiter(5, 60 * 1000), wrapRequestHandler(authController.refreshToken))

authRoutes.post('/verify-email', generalRateLimiter(5, 60 * 1000), wrapRequestHandler(authController.verifyEmail))

authRoutes.post('/resend-verification-email', resendEmailRateLimiter, wrapRequestHandler(authController.resendVerificationEmail))

authRoutes.get(
  '/login/google',
  generalRateLimiter(5, 60 * 1000),
  passport.authenticate('google', { scope: ['profile', 'email'], session: false })
);

authRoutes.get(
  '/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/login' }),
  wrapRequestHandler(authController.googleLogin)
)

export default authRoutes
