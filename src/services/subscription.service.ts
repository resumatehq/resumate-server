import { Types } from 'mongoose';
import { IUser } from '~/models/schemas/user.schema';
import redisClient from '~/config/redis';
import { ErrorWithStatus } from '~/utils/error.utils';
import HTTP_STATUS_CODES from '~/core/statusCodes';
import databaseServices from './database.service';
import { ObjectId } from 'mongodb';
import { USER_MESSAGES } from '~/constants/messages';
import usersService from './user.service';
import { logger } from '~/loggers/my-logger.log';
import { getUserById, updateUserAndCache } from '~/utils/user.utils';

class SubscriptionService {
    private excludeSensitiveFields(user: any): Omit<IUser, 'password' | 'forgot_password_token' | 'email_verify_token' | 'forgot_password'> {
        const { password, forgot_password_token, email_verify_token, forgot_password, ...userWithoutSensitiveData } = user;
        return userWithoutSensitiveData;
    }

    /**
     * Upgrade user to premium plan
     * @param userId User ID
     * @param plan Premium plan type (monthly or yearly)
     * @param paymentId Payment ID from payment provider
     * @param paymentProvider Payment provider (stripe or paypal)
     */
    async upgradeToPremium(
        userId: string | Types.ObjectId,
        plan: 'premium_monthly' | 'premium_yearly',
        paymentId: string,
        paymentProvider: 'stripe' | 'paypal'
    ): Promise<IUser> {
        logger.info(
            `Upgrading user to premium plan: ${plan}`,
            'SubscriptionService.upgradeToPremium',
            '',
            { userId: userId.toString(), plan, paymentProvider }
        );

        const user = await getUserById(userId);

        const startDate = new Date();
        const expiryDate = new Date();

        if (plan === 'premium_monthly') {
            expiryDate.setMonth(expiryDate.getMonth() + 1);
        } else if (plan === 'premium_yearly') {
            expiryDate.setFullYear(expiryDate.getFullYear() + 1);
        }

        const subscription: IUser['subscription'] = {
            plan,
            startDate,
            expiryDate,
            hasTrial: true,
            endDate: expiryDate,
            status: 'active' as const,
            paymentId,
            paymentMethod: paymentProvider,
            paymentProvider,
            autoRenew: true,
            cancelledAt: undefined,
            trialEndsAt: undefined
        };

        // Get updated permissions from user service
        user.subscription = subscription;
        const updatedPermissions = usersService.updatePermissions(user);

        const updatedUser = await updateUserAndCache(userId, {
            tier: 'premium',
            subscription,
            permissions: updatedPermissions.permissions
        });

        logger.info(
            'User successfully upgraded to premium',
            'SubscriptionService.upgradeToPremium',
            '',
            {
                userId: userId.toString(),
                plan,
                expiryDate: expiryDate.toISOString()
            }
        );

        return updatedUser;
    }

    /**
     * Downgrade user to free plan
     * @param userId User ID
     */
    async downgradeToFree(userId: string | Types.ObjectId): Promise<IUser> {
        logger.info(
            'Downgrading user to free plan',
            'SubscriptionService.downgradeToFree',
            '',
            { userId: userId.toString() }
        );

        const user = await getUserById(userId);

        // Update user subscription
        const subscription: IUser['subscription'] = {
            plan: 'free' as const,
            status: 'active' as const,
            hasTrial: true,
            paymentProvider: null,
            autoRenew: false,
            startDate: undefined,
            endDate: undefined,
            expiryDate: undefined,
            trialEndsAt: undefined,
            cancelledAt: undefined,
            paymentMethod: undefined,
            paymentId: undefined
        };

        // Get updated permissions from user service
        user.subscription = subscription;
        const updatedPermissions = usersService.updatePermissions(user);

        const updatedUser = await updateUserAndCache(userId, {
            tier: 'free',
            subscription,
            permissions: updatedPermissions.permissions
        });

        logger.info(
            'User successfully downgraded to free plan',
            'SubscriptionService.downgradeToFree',
            '',
            { userId: userId.toString() }
        );

        return updatedUser;
    }

    /**
     * Cancel subscription but maintain premium until expiry
     * @param userId User ID
     */
    async cancelAutoRenewal(userId: string | Types.ObjectId): Promise<IUser> {
        logger.info(
            'Cancelling subscription auto-renewal',
            'SubscriptionService.cancelAutoRenewal',
            '',
            { userId: userId.toString() }
        );

        const user = await getUserById(userId);

        if (!user.subscription) {
            logger.error(
                'No active subscription found',
                'SubscriptionService.cancelAutoRenewal',
                '',
                { userId: userId.toString() }
            );
            throw new ErrorWithStatus({
                message: 'No active subscription found',
                status: HTTP_STATUS_CODES.BAD_REQUEST
            });
        }

        // Keep the subscription active but mark auto-renewal as disabled
        const subscription: IUser['subscription'] = {
            ...user.subscription,
            autoRenew: false,
            status: 'cancelled',
            cancelledAt: new Date()
        };

        const updatedUser = await updateUserAndCache(userId, {
            subscription
        });

        logger.info(
            'Auto-renewal successfully cancelled',
            'SubscriptionService.cancelAutoRenewal',
            '',
            {
                userId: userId.toString(),
                expiryDate: user.subscription.expiryDate instanceof Date ? user.subscription.expiryDate.toISOString() : null
            }
        );

        return updatedUser;
    }

    /**
     * Re-enable auto-renewal for subscription
     * @param userId User ID
     */
    async enableAutoRenewal(userId: string | Types.ObjectId): Promise<IUser> {
        const user = await getUserById(userId);

        if (!user.subscription) {
            throw new ErrorWithStatus({
                message: 'No active subscription found',
                status: HTTP_STATUS_CODES.BAD_REQUEST
            });
        }

        // Ensure user has a premium subscription
        if (user.subscription.plan === 'premium_monthly' || user.subscription.plan === 'premium_yearly') {
            const subscription: IUser['subscription'] = {
                ...user.subscription,
                autoRenew: true,
                status: 'active' as const,
                cancelledAt: undefined
            };

            const updatedUser = await updateUserAndCache(userId, {
                subscription
            });

            return updatedUser;
        } else {
            throw new ErrorWithStatus({
                message: 'Cannot enable auto-renewal for non-premium subscription',
                status: HTTP_STATUS_CODES.BAD_REQUEST
            });
        }
    }

    /**
     * Check if subscription is active
     * @param userId User ID
     */
    async isSubscriptionActive(userId: string | Types.ObjectId): Promise<boolean> {
        const user = await getUserById(userId);

        if (user.tier !== 'premium') {
            return false;
        }

        if (!user.subscription || !user.subscription.expiryDate) {
            return false;
        }

        return (
            (user.subscription.status === 'active' || user.subscription.hasTrial) &&
            new Date(user.subscription.expiryDate) > new Date()
        );
    }

    /**
     * Start a free trial for a user
     * @param userId User ID
     * @param trialDurationDays Number of days for trial (default: 14)
     */
    async startFreeTrial(userId: string | Types.ObjectId): Promise<IUser> {
        const trialDurationDays = 14;
        logger.info(
            'Starting free trial for user',
            'SubscriptionService.startFreeTrial',
            '',
            { userId: userId.toString(), trialDurationDays }
        );

        const user = await getUserById(userId);

        const startDate = new Date();
        const trialEndsAt = new Date();
        trialEndsAt.setDate(trialEndsAt.getDate() + trialDurationDays);

        const subscription: IUser['subscription'] = {
            plan: 'premium_monthly',
            status: 'trial',
            hasTrial: true,
            startDate,
            expiryDate: trialEndsAt,
            endDate: trialEndsAt,
            trialEndsAt,
            autoRenew: false,
            paymentProvider: null,
        };

        // Get updated permissions from user service
        user.subscription = subscription;
        const updatedPermissions = usersService.updatePermissions(user);

        const updatedUser = await updateUserAndCache(userId, {
            tier: 'premium',
            subscription,
            permissions: updatedPermissions.permissions
        });

        logger.info(
            'Free trial started successfully',
            'SubscriptionService.startFreeTrial',
            '',
            {
                userId: userId.toString(),
                trialEndsAt: trialEndsAt.toISOString()
            }
        );

        return updatedUser;
    }

    /**
     * Initialize permissions with allowed templates
     * 
     * This updates a user's permissions to include all allowed templates
     * based on their subscription plan
     */
    async initializePermissions(userId: string | Types.ObjectId): Promise<IUser> {
        const user = await getUserById(userId);

        // Get templates based on user tier
        const templates = await databaseServices.templates.find({}).toArray();
        const freeTemplates = templates.filter(template => template.tier === 'free');
        const allTemplates = templates;

        const freeTemplateIds = freeTemplates.map(template => template._id);
        const allTemplateIds = allTemplates.map(template => template._id);

        // Update permissions based on plan and subscription status
        const isPremium = user.tier !== 'free' &&
            (user.subscription.status === 'active' ||
                user.subscription.status === 'trial');

        // Get updated permissions using UserService (use the singleton instance)
        const { tier, permissions } = usersService.updatePermissions(user);

        // Add template permissions
        permissions.allowedTemplates = isPremium ? allTemplateIds : freeTemplateIds;

        const updatedUser = await updateUserAndCache(userId, {
            tier,
            permissions
        });

        return updatedUser;
    }

    /**
     * Check for expired subscriptions and update them
     * This should be run as a cron job daily
     */
    async processExpiredSubscriptions(): Promise<void> {
        logger.info(
            'Starting to process expired subscriptions',
            'SubscriptionService.processExpiredSubscriptions'
        );

        // Find users whose subscriptions expire within the next 24 hours and have auto-renewal enabled
        const oneDayFromNow = new Date();
        oneDayFromNow.setDate(oneDayFromNow.getDate() + 1);

        const autoRenewUsers = await databaseServices.users.find({
            tier: 'premium',
            'subscription.status': { $in: ['active', 'trial'] },
            'subscription.autoRenew': true,
            'subscription.expiryDate': {
                $gte: new Date(),
                $lte: oneDayFromNow
            }
        }).toArray();

        logger.info(
            `Found ${autoRenewUsers.length} subscriptions due for auto-renewal`,
            'SubscriptionService.processExpiredSubscriptions',
            '',
            { count: autoRenewUsers.length }
        );

        for (const user of autoRenewUsers) {
            try {
                // Process auto-renewal payment
                // This would be integrated with your payment processor (Stripe/PayPal)
                const renewalResult = await this.processAutoRenewal(user._id.toString());
                logger.info(
                    `Auto-renewal for user ${user._id}: ${renewalResult ? 'Success' : 'Failed'}`,
                    'SubscriptionService.processExpiredSubscriptions',
                    '',
                    { userId: user._id.toString(), success: renewalResult }
                );
            } catch (error) {
                logger.error(
                    `Error during auto-renewal for user ${user._id}`,
                    'SubscriptionService.processExpiredSubscriptions',
                    '',
                    {
                        userId: user._id.toString(),
                        error: error instanceof Error ? error.message : String(error)
                    }
                );
            }
        }

        // Find already expired subscriptions
        const expiredUsers = await databaseServices.users.find({
            tier: 'premium',
            'subscription.status': { $in: ['active', 'trial'] },
            'subscription.expiryDate': { $lt: new Date() }
        }).toArray();

        logger.info(
            `Found ${expiredUsers.length} expired subscriptions to process`,
            'SubscriptionService.processExpiredSubscriptions',
            '',
            { count: expiredUsers.length }
        );

        for (const user of expiredUsers) {
            try {
                // Set subscription to expired
                if (user.subscription) {
                    user.subscription.status = 'expired';

                    // If auto-renewal is disabled or payment has failed, downgrade to free
                    if (!user.subscription.autoRenew) {
                        await this.downgradeToFree(user._id);
                        logger.info(
                            `User ${user._id} downgraded to free plan (subscription expired, auto-renewal disabled)`,
                            'SubscriptionService.processExpiredSubscriptions',
                            '',
                            { userId: user._id.toString() }
                        );
                    } else {
                        // Just mark as expired for now, the renewal job will handle it
                        await updateUserAndCache(user._id, {
                            subscription: {
                                ...user.subscription,
                                status: 'expired'
                            }
                        });
                        logger.info(
                            `User ${user._id} subscription marked as expired`,
                            'SubscriptionService.processExpiredSubscriptions',
                            '',
                            { userId: user._id.toString() }
                        );
                    }
                }
            } catch (error) {
                logger.error(
                    `Error processing expired subscription for user ${user._id}`,
                    'SubscriptionService.processExpiredSubscriptions',
                    '',
                    {
                        userId: user._id.toString(),
                        error: error instanceof Error ? error.message : String(error)
                    }
                );
            }
        }

        // Process expired trials separately
        const expiredTrials = await databaseServices.users.find({
            tier: 'premium',
            'subscription.status': 'trial',
            'subscription.trialEndsAt': { $lt: new Date() }
        }).toArray();

        logger.info(
            `Found ${expiredTrials.length} expired trials to process`,
            'SubscriptionService.processExpiredSubscriptions',
            '',
            { count: expiredTrials.length }
        );

        for (const user of expiredTrials) {
            try {
                // Downgrade trial users to free
                await this.downgradeToFree(user._id);
                logger.info(
                    `User ${user._id} downgraded to free plan (trial expired)`,
                    'SubscriptionService.processExpiredSubscriptions',
                    '',
                    { userId: user._id.toString() }
                );
            } catch (error) {
                logger.error(
                    `Error processing expired trial for user ${user._id}`,
                    'SubscriptionService.processExpiredSubscriptions',
                    '',
                    {
                        userId: user._id.toString(),
                        error: error instanceof Error ? error.message : String(error)
                    }
                );
            }
        }

        logger.info(
            'Finished processing expired subscriptions',
            'SubscriptionService.processExpiredSubscriptions'
        );
    }

    /**
     * Process auto-renewal for a user's subscription
     * @param userId User ID
     * @returns boolean indicating success
     */
    async processAutoRenewal(userId: string): Promise<boolean> {
        logger.info(
            'Processing auto-renewal for user',
            'SubscriptionService.processAutoRenewal',
            '',
            { userId }
        );

        const user = await getUserById(userId);

        if (!user || user.tier !== 'premium' || !user.subscription || !user.subscription.autoRenew) {
            logger.warn(
                'Cannot process auto-renewal: user not eligible',
                'SubscriptionService.processAutoRenewal',
                '',
                {
                    userId,
                    hasPremiumTier: user?.tier === 'premium',
                    hasSubscription: !!user?.subscription,
                    hasAutoRenew: !!user?.subscription?.autoRenew
                }
            );
            return false;
        }

        // In a real application, this would call your payment processor API
        // to charge the user's saved payment method
        try {
            // For demonstration, we'll just simulate a successful payment
            const startDate = new Date();
            const newExpiryDate = new Date();

            if (user.subscription.plan === 'premium_monthly') {
                newExpiryDate.setMonth(newExpiryDate.getMonth() + 1);
            } else if (user.subscription.plan === 'premium_yearly') {
                newExpiryDate.setFullYear(newExpiryDate.getFullYear() + 1);
            }

            // Update with new expiry date and keep status active
            const subscription: IUser['subscription'] = {
                ...user.subscription,
                startDate,
                expiryDate: newExpiryDate,
                endDate: newExpiryDate,
                status: 'active' as const,
                trialEndsAt: undefined,
                cancelledAt: undefined
            };

            await updateUserAndCache(userId, {
                subscription
            });

            logger.info(
                'Auto-renewal processed successfully',
                'SubscriptionService.processAutoRenewal',
                '',
                {
                    userId,
                    plan: user.subscription.plan,
                    newExpiryDate: newExpiryDate.toISOString()
                }
            );

            return true;
        } catch (error) {
            logger.error(
                'Error processing auto-renewal',
                'SubscriptionService.processAutoRenewal',
                '',
                {
                    userId,
                    error: error instanceof Error ? error.message : String(error)
                }
            );
            return false;
        }
    }
}

export default new SubscriptionService(); 