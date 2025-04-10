import { Router } from 'express'
import passport from 'passport'
import authController from '~/controllers/auth.controller';
import { accessTokenValidation, loginValidation, refreshTokenValidation, registerValidation } from '~/middlewares/auth.middlewares'
import { wrapRequestHandler } from '~/utils/wrapHandler'


const authRoutes = Router();

authRoutes.post('/register', registerValidation, wrapRequestHandler(authController.register))


authRoutes.post('/login', loginValidation, wrapRequestHandler(authController.login))


authRoutes.delete('/logout', accessTokenValidation, refreshTokenValidation, wrapRequestHandler(authController.logout))


authRoutes.post('/refresh-token', refreshTokenValidation, wrapRequestHandler(authController.refreshToken))


authRoutes.post('/verify-email', wrapRequestHandler(authController.verifyEmail))


authRoutes.post('/resend-verification-email', wrapRequestHandler(authController.resendVerificationEmail))


authRoutes.get(
  '/login/google',
  passport.authenticate('google', { scope: ['profile', 'email'], session: false })
);

authRoutes.get(
  '/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/login' }),
  wrapRequestHandler(authController.googleLogin)
)

export default authRoutes
