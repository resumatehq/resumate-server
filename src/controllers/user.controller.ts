import { Request, Response } from "express";
import { USER_MESSAGES } from "~/constants/messages";
import { TokenPayload } from "~/models/requests/user.request";
import { IUser } from "~/models/schemas/user.schema";
import usersService from "~/services/user.service";
import { OK } from "~/core/succes.response";
import { ErrorWithStatus } from "~/utils/error.utils";
import HTTP_STATUS_CODES from "~/core/statusCodes";
import { ac, FEATURES } from "~/config/roles";
import subscriptionService from "~/services/subscription.service";

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

        const trimmedEmail = email.trim();

        // Validate email format
        const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        if (!emailPattern.test(trimmedEmail)) {
            throw new ErrorWithStatus({
                message: 'Please enter a valid email format.',
                status: HTTP_STATUS_CODES.BAD_REQUEST
            });
        }

        // Prevent broad searches
        const commonDomains = ['@gmail.com', '@yahoo.com', '@hotmail.com', '@outlook.com'];
        if (commonDomains.some(domain => trimmedEmail.toLowerCase() === domain)) {
            throw new ErrorWithStatus({
                message: 'Please enter a more specific search term.',
                status: HTTP_STATUS_CODES.BAD_REQUEST
            });
        }

        // Thêm type guard và kiểm tra mảng
        const users = await usersService.searchUserByEmail(trimmedEmail);

        // Đảm bảo users là mảng
        if (!Array.isArray(users)) {
            throw new ErrorWithStatus({
                message: 'Invalid user data format',
                status: HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR
            });
        }

        new OK({
            message: USER_MESSAGES.GET_USER_SUCCESSFULLY,
            data: {
                users,
                total: users.length, // Đã an toàn với type Array
                query: trimmedEmail
            },
        }).send(res);
    }

    updateProfile = async (req: Request, res: Response) => {
        const { user_id } = req.decoded_authorization as TokenPayload;

        if (req.file_url) {
            req.body.avatar_url = req.file_url;
        }

        const {
            username,
            avatar_url,
            date_of_birth,
            bio,
            industry,
            experience,
            location,
            phone,
            social_links
        } = req.body;

        // Validate that at least one field is provided
        if (!username && !avatar_url && !date_of_birth && !bio && !industry &&
            !experience && !location && !phone && !social_links) {
            throw new ErrorWithStatus({
                message: 'At least one profile field is required for update',
                status: HTTP_STATUS_CODES.BAD_REQUEST
            });
        }

        const result = await usersService.updateProfile(user_id, {
            username,
            avatar_url,
            date_of_birth: date_of_birth ? new Date(date_of_birth) : undefined,
            bio,
            industry,
            experience,
            location,
            phone,
            social_links
        });

        new OK({
            message: 'Profile updated successfully',
            data: result
        }).send(res);
    }


    getUserFeatures = async (req: Request, res: Response) => {
        const { user_id } = req.decoded_authorization as TokenPayload;

        // Get user data
        const user = await usersService.getUserById(user_id) as IUser;

        // Determine the appropriate role for AccessControl based on user's tier and subscription
        let accessControlRole = 'free';

        if (user.tier !== 'free' && user.subscription.status === 'active') {
            accessControlRole = 'premium';
        }

        // Generate permissions map for all features
        const featurePermissions: Record<string, boolean> = {};

        // Check permissions for all defined features
        Object.values(FEATURES).forEach(feature => {
            featurePermissions[feature] = (ac.can(accessControlRole).createAny(feature) as any).granted || false;
        });

        const enabledFeatures = Object.entries(featurePermissions).filter(([_, hasAccess]) => hasAccess !== false).map(([featureName, _]) => featureName)

        new OK({
            message: 'User features retrieved successfully',
            data: {
                tier: user.tier,
                subscription: user.subscription,
                features: enabledFeatures,
                usage: user.usage,
                permissions: user.permissions
            }
        }).send(res);
    }

    // Subscription and profile management
    // Upgrade to premium subscription
    upgradeToPremium = async (req: Request, res: Response) => {
        const { user_id } = req.decoded_authorization as TokenPayload;
        const { plan, paymentId, paymentProvider } = req.body;

        if (!plan || !paymentId || !paymentProvider) {
            throw new ErrorWithStatus({
                message: 'Plan, paymentId, and paymentProvider are required',
                status: HTTP_STATUS_CODES.BAD_REQUEST
            });
        }

        if (plan !== 'premium_monthly' && plan !== 'premium_yearly') {
            throw new ErrorWithStatus({
                message: 'Plan must be premium_monthly or premium_yearly',
                status: HTTP_STATUS_CODES.BAD_REQUEST
            });
        }

        const user = await subscriptionService.upgradeToPremium(
            user_id,
            plan,
            paymentId,
            paymentProvider
        );

        new OK({
            message: `Successfully upgraded to ${plan}`,
            data: user
        }).send(res);
    }

    // Cancel auto-renewal but maintain premium until expiry
    cancelAutoRenewal = async (req: Request, res: Response) => {
        const { user_id } = req.decoded_authorization as TokenPayload;

        const user = await subscriptionService.cancelAutoRenewal(user_id);

        new OK({
            message: 'Auto-renewal canceled. Your premium features will be available until your subscription expires.',
            data: user
        }).send(res);
    }

    // Re-enable auto-renewal
    enableAutoRenewal = async (req: Request, res: Response) => {
        const { user_id } = req.decoded_authorization as TokenPayload;

        const user = await subscriptionService.enableAutoRenewal(user_id);

        new OK({
            message: 'Auto-renewal enabled. Your subscription will automatically renew at the end of the current period.',
            data: user
        }).send(res);
    }

    // Get subscription status
    getSubscriptionStatus = async (req: Request, res: Response) => {
        const { user_id } = req.decoded_authorization as TokenPayload;

        const user = await usersService.getUserById(user_id) as IUser;

        if (!user) {
            throw new ErrorWithStatus({
                message: USER_MESSAGES.USER_NOT_FOUND,
                status: HTTP_STATUS_CODES.NOT_FOUND
            });
        }

        const isActive = await subscriptionService.isSubscriptionActive(user_id);

        new OK({
            message: 'Subscription status retrieved successfully',
            data: {
                isPrenium: isActive,
                tier: user.tier,
                subscription: user.subscription,
                permissions: user.permissions
            }
        }).send(res);
    }

    // Start free trial for a user
    startFreeTrial = async (req: Request, res: Response) => {
        const { user_id } = req.decoded_authorization as TokenPayload;

        // Validate if the user is eligible for a trial
        const user = await usersService.getUserById(user_id) as IUser;
        if (!user) {
            throw new ErrorWithStatus({
                message: USER_MESSAGES.USER_NOT_FOUND,
                status: HTTP_STATUS_CODES.NOT_FOUND
            });
        }

        // // Check if user already has an active subscription
        // if (user.subscription &&
        //     (user.subscription.hasTrial)) {
        //     throw new ErrorWithStatus({
        //         message: 'User already has an active subscription or trial',
        //         status: HTTP_STATUS_CODES.BAD_REQUEST
        //     });
        // }
        console.log(user.subscription.hasTrial)
        console.log(user.subscription.trialEndsAt)
        console.log(user.subscription.hasTrial && user.subscription.trialEndsAt)

        // Check if user already used a trial
        if (user.subscription.hasTrial && user.subscription.trialEndsAt) {
            throw new ErrorWithStatus({
                message: 'User has already used their free trial',
                status: HTTP_STATUS_CODES.BAD_REQUEST
            });
        }

        const result = await subscriptionService.startFreeTrial(
            user_id
        );

        new OK({
            message: 'Free trial started successfully',
            data: result
        }).send(res);
    }

    // Downgrade to free plan
    downgradeToFree = async (req: Request, res: Response) => {
        const { user_id } = req.decoded_authorization as TokenPayload;

        const user = await usersService.getUserById(user_id) as IUser;
        if (!user) {
            throw new ErrorWithStatus({
                message: USER_MESSAGES.USER_NOT_FOUND,
                status: HTTP_STATUS_CODES.NOT_FOUND
            });
        }

        // Check if user is already on free plan
        if (user.tier === 'free') {
            throw new ErrorWithStatus({
                message: 'User is already on the free plan',
                status: HTTP_STATUS_CODES.BAD_REQUEST
            });
        }

        const result = await subscriptionService.downgradeToFree(user_id);

        new OK({
            message: 'Successfully downgraded to free plan',
            data: result
        }).send(res);
    }

    // Initialize permissions
    initializePermissions = async (req: Request, res: Response) => {
        const { user_id } = req.decoded_authorization as TokenPayload;

        const user = await usersService.getUserById(user_id) as IUser;
        if (!user) {
            throw new ErrorWithStatus({
                message: USER_MESSAGES.USER_NOT_FOUND,
                status: HTTP_STATUS_CODES.NOT_FOUND
            });
        }

        const result = await subscriptionService.initializePermissions(user_id);

        new OK({
            message: 'User permissions initialized successfully',
            data: result
        }).send(res);
    }
}

export default new UserController();