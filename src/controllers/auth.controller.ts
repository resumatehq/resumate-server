"use strict";

import { Request, Response } from "express";
import { envConfig } from "~/constants/config";
import { USER_MESSAGES } from "~/constants/messages";
import HTTP_STATUS_CODES from "~/core/statusCodes";
import { CREATED, OK } from "~/core/succes.response";
import { TokenPayload } from "~/models/requests/user.request";
import authService from "~/services/auth.service";
import { ErrorWithStatus } from "~/utils/error.utils";

interface CustomRequest extends Request {
    decoded_refresh_token?: TokenPayload
}

class AuthController {
    register = async (req: Request, res: Response) => {
        if (req.file_url) {
            console.log('Avatar URL from upload middleware:', req.file_url);
            req.body.avatar_url = req.file_url;
        }

        console.log('Register request body:', {
            ...req.body,
            password: '******',
            confirm_password: '******',
            avatar_url: req.body.avatar_url || 'No avatar provided'
        });

        const result = await authService.register(req.body)

        console.log('Registration complete, user ID:', result.user_id);

        new CREATED({
            message: USER_MESSAGES.REGISTER_SUCCESSFULLY,
            data: {
                user: {
                    id: result.user_id,
                    email: result.email,
                    username: result.username,
                    avatar_url: result.avatar_url,
                    verification_status: 'pending'
                },
                next_steps: {
                    action: 'verify_email',
                    message: 'Please check your email to verify your account'
                }
            }
        }).send(res);
    }

    login = async (req: Request, res: Response) => {
        const result = await authService.login(req.body)
        new OK({
            message: USER_MESSAGES.LOGIN_SUCCESSFULLY,
            data: result
        }).send(res);
    }

    googleLogin = async (req: Request, res: Response) => {
        const queryString = (await import('querystring')).default;

        if (!req.user) {
            throw new ErrorWithStatus({
                status: HTTP_STATUS_CODES.UNAUTHORIZED,
                message: USER_MESSAGES.USER_NOT_FOUND
            });
        }

        const { access_token, refresh_token, user: userResponse } = await authService.googleLogin(req.user);

        const redirectUrl = envConfig.googleRedirectClientUrl;
        if (!redirectUrl) {
            throw new ErrorWithStatus({
                status: HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR,
                message: 'Redirect URL is not configured'
            });
        }

        const userData = {
            _id: userResponse._id,
            email: userResponse.email,
            username: userResponse.username,
            avatar_url: userResponse.avatar_url,
            verify: userResponse.verify
        };

        const qs = queryString.stringify({
            access_token,
            refresh_token,
            user: encodeURIComponent(JSON.stringify(userData)),
            status: HTTP_STATUS_CODES.OK
        });

        res.redirect(`${redirectUrl}?${qs}`);
    }

    logout = async (req: Request, res: Response) => {
        const { refresh_token } = req.body;
        const { user_id } = req.decoded_authorization as TokenPayload;

        await authService.logout({
            user_id,
            refresh_token,
        });

        res.clearCookie('refresh_token', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict'
        });

        new OK({
            message: USER_MESSAGES.LOGOUT_SUCCESSFULLY
        }).send(res);
    }

    refreshToken = async (req: CustomRequest, res: Response) => {
        const { refresh_token } = req.body;
        const { user_id, verify, tier } = req.decoded_refresh_token as TokenPayload

        const result = await authService.refreshToken({ user_id, verify, tier, refresh_token });

        new OK({
            message: USER_MESSAGES.REFRESH_TOKEN_SUCCESSFULLY,
            data: result
        }).send(res);
    }

    verifyEmail = async (req: Request, res: Response) => {
        const { token } = req.body;

        if (!token) {
            throw new ErrorWithStatus({
                status: HTTP_STATUS_CODES.BAD_REQUEST,
                message: USER_MESSAGES.EMAIL_VERIFICATION_TOKEN_REQUIRED
            });
        }

        const result = await authService.verifyEmail(token);

        new OK({
            message: USER_MESSAGES.EMAIL_VERIFIED_SUCCESSFULLY,
            data: result
        }).send(res);
    }

    resendVerificationEmail = async (req: Request, res: Response) => {
        const { email } = req.body;

        if (!email) {
            throw new ErrorWithStatus({
                status: HTTP_STATUS_CODES.BAD_REQUEST,
                message: USER_MESSAGES.EMAIL_REQUIRED
            });
        }

        const result = await authService.resendVerificationEmail(email);

        new OK({
            message: USER_MESSAGES.RESEND_VERIFY_EMAIL_SUCCESSFULLY
        }).send(res);
    }
}

const authController = new AuthController();

export default authController
