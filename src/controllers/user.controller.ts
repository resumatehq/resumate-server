import { Request, Response } from "express";
import { USER_MESSAGES } from "~/constants/messages";
import { TokenPayload } from "~/models/requests/user.request";
import usersService from "~/services/user.service";
import { OK } from "~/core/succes.response";
import { ErrorWithStatus } from "~/utils/error.utils";
import HTTP_STATUS_CODES from "~/core/statusCodes";

class UserController {
    getProfile = async (req: Request, res: Response) => {
        const { user_id } = req.decoded_authorization as TokenPayload;
        const user = await usersService.getUserById(user_id);
        new OK({
            message: USER_MESSAGES.GET_USER_SUCCESSFULLY,
            data: user,
        }).send(res);
    }

    searchUserByEmail = async (req: Request, res: Response) => {
        const { email } = req.query;

        // Validate email parameter
        if (!email || typeof email !== 'string') {
            throw new ErrorWithStatus({
                message: 'Email parameter is required and must be a string.',
                status: HTTP_STATUS_CODES.BAD_REQUEST
            });
        }

        // Prevent searching for empty or invalid email patterns
        const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        if (!emailPattern.test(email.trim())) {
            throw new ErrorWithStatus({
                message: 'Please enter a valid email format.',
                status: HTTP_STATUS_CODES.BAD_REQUEST
            });
        }

        // Prevent searching for common email domains without specific query
        const commonDomains = ['@gmail.com', '@yahoo.com', '@hotmail.com', '@outlook.com'];
        if (commonDomains.some(domain => email.trim().toLowerCase() === domain)) {
            throw new ErrorWithStatus({
                message: 'Please enter a more specific search term.',
                status: HTTP_STATUS_CODES.BAD_REQUEST
            });
        }

        const users = await usersService.searchUserByEmail(email.trim());

        new OK({
            message: USER_MESSAGES.GET_USER_SUCCESSFULLY,
            data: {
                users,
                total: users.length,
                query: email.trim()
            },
        }).send(res);
    }
}

export default new UserController();