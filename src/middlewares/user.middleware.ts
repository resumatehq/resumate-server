import { Request, Response, NextFunction } from 'express';
import { ErrorWithStatus } from '~/utils/error.utils';
import HTTP_STATUS_CODES from '~/core/statusCodes';
import { wrapRequestHandler } from '~/utils/wrapHandler';

// export const validateSubscriptionUpdate = wrapRequestHandler((req: Request, res: Response, next: NextFunction) => {
//     const { plan, status, paymentId, paymentProvider, autoRenew } = req.body;

//     // Validate required fields
//     if (!status) {
//         throw new ErrorWithStatus({
//             message: 'Status is required',
//             status: HTTP_STATUS_CODES.BAD_REQUEST
//         });
//     }

//     // Validate status
//     const validStatuses = ['active', 'expired', 'canceled'];
//     if (!validStatuses.includes(status)) {
//         throw new ErrorWithStatus({
//             message: `Status must be one of: ${validStatuses.join(', ')}`,
//             status: HTTP_STATUS_CODES.BAD_REQUEST
//         });
//     }

//     // If status is 'canceled', force plan to 'free'
//     if (status === 'canceled') {
//         req.body.plan = 'free';
//         req.body.autoRenew = false;
//     } else {
//         // Validate plan for non-canceled status
//         if (!plan) {
//             throw new ErrorWithStatus({
//                 message: 'Plan is required for active or expired status',
//                 status: HTTP_STATUS_CODES.BAD_REQUEST
//             });
//         }

//         const validPlans = ['free', 'premium_monthly', 'premium_yearly'];
//         if (!validPlans.includes(plan)) {
//             throw new ErrorWithStatus({
//                 message: `Plan must be one of: ${validPlans.join(', ')}`,
//                 status: HTTP_STATUS_CODES.BAD_REQUEST
//             });
//         }
//     }

//     // Validate autoRenew if provided
//     if (autoRenew !== undefined && typeof autoRenew !== 'boolean') {
//         throw new ErrorWithStatus({
//             message: 'autoRenew must be a boolean value',
//             status: HTTP_STATUS_CODES.BAD_REQUEST
//         });
//     }

//     // Validate dates if provided
//     // if (startDate) {
//     //     const startDateObj = new Date(startDate);
//     //     if (isNaN(startDateObj.getTime())) {
//     //         throw new ErrorWithStatus({
//     //             message: 'Invalid startDate format',
//     //             status: HTTP_STATUS_CODES.BAD_REQUEST
//     //         });
//     //     }
//     // }

//     // if (expiryDate) {
//     //     const expiryDateObj = new Date(expiryDate);
//     //     if (isNaN(expiryDateObj.getTime())) {
//     //         throw new ErrorWithStatus({
//     //             message: 'Invalid expiryDate format',
//     //             status: HTTP_STATUS_CODES.BAD_REQUEST
//     //         });
//     //     }

//     //     // If both dates are provided, validate that expiryDate is after startDate
//     //     if (startDate) {
//     //         const startDateObj = new Date(startDate);
//     //         if (expiryDateObj <= startDateObj) {
//     //             throw new ErrorWithStatus({
//     //                 message: 'expiryDate must be after startDate',
//     //                 status: HTTP_STATUS_CODES.BAD_REQUEST
//     //             });
//     //         }
//     //     }
//     // }

//     // Validate payment related fields
//     if (paymentProvider) {
//         const validProviders = ['stripe', 'paypal'];
//         if (!validProviders.includes(paymentProvider)) {
//             throw new ErrorWithStatus({
//                 message: 'Payment provider must be either stripe or paypal',
//                 status: HTTP_STATUS_CODES.BAD_REQUEST
//             });
//         }

//         // Require paymentId when paymentProvider is specified
//         if (!paymentId) {
//             throw new ErrorWithStatus({
//                 message: 'paymentId is required when paymentProvider is specified',
//                 status: HTTP_STATUS_CODES.BAD_REQUEST
//             });
//         }

//         // Validate paymentId format based on provider
//         if (paymentProvider === 'stripe' && !paymentId.startsWith('pi_')) {
//             throw new ErrorWithStatus({
//                 message: 'Invalid Stripe payment ID format',
//                 status: HTTP_STATUS_CODES.BAD_REQUEST
//             });
//         }
//     } else {
//         // If no payment provider, there should be no paymentId
//         if (paymentId) {
//             throw new ErrorWithStatus({
//                 message: 'paymentId cannot be set without a paymentProvider',
//                 status: HTTP_STATUS_CODES.BAD_REQUEST
//             });
//         }
//     }

//     // Additional business logic validations
//     if (plan === 'free') {
//         // Free plan shouldn't have payment information
//         if (paymentProvider || paymentId) {
//             throw new ErrorWithStatus({
//                 message: 'Free plan cannot have payment information',
//                 status: HTTP_STATUS_CODES.BAD_REQUEST
//             });
//         }
//     } else {
//         // Premium plans should have payment information if status is active
//         if (status === 'active' && (!paymentProvider || !paymentId)) {
//             throw new ErrorWithStatus({
//                 message: 'Premium plans require payment information',
//                 status: HTTP_STATUS_CODES.BAD_REQUEST
//             });
//         }
//     }

//     next();
// })

export const validateSubscriptionUpgrade = wrapRequestHandler((req: Request, res: Response, next: NextFunction) => {
    const { plan, paymentId, paymentProvider, autoRenew } = req.body;

    // Validate required fields
    if (!plan) {
        throw new ErrorWithStatus({
            message: 'Plan is required',
            status: HTTP_STATUS_CODES.BAD_REQUEST
        });
    }

    // Validate plan
    const validPlans = ['premium_monthly', 'premium_yearly'];
    if (!validPlans.includes(plan)) {
        throw new ErrorWithStatus({
            message: `Plan must be one of: ${validPlans.join(', ')}`,
            status: HTTP_STATUS_CODES.BAD_REQUEST
        });
    }

    // Validate payment related fields
    if (!paymentProvider) {
        throw new ErrorWithStatus({
            message: 'Payment provider is required',
            status: HTTP_STATUS_CODES.BAD_REQUEST
        });
    }

    const validProviders = ['stripe', 'paypal'];
    if (!validProviders.includes(paymentProvider)) {
        throw new ErrorWithStatus({
            message: 'Payment provider must be either stripe or paypal',
            status: HTTP_STATUS_CODES.BAD_REQUEST
        });
    }

    // Require paymentId when paymentProvider is specified
    if (!paymentId) {
        throw new ErrorWithStatus({
            message: 'paymentId is required',
            status: HTTP_STATUS_CODES.BAD_REQUEST
        });
    }

    // Validate paymentId format based on provider
    if (paymentProvider === 'stripe' && !paymentId.startsWith('pi_')) {
        throw new ErrorWithStatus({
            message: 'Invalid Stripe payment ID format',
            status: HTTP_STATUS_CODES.BAD_REQUEST
        });
    }

    // Validate autoRenew if provided
    if (autoRenew !== undefined && typeof autoRenew !== 'boolean') {
        throw new ErrorWithStatus({
            message: 'autoRenew must be a boolean value',
            status: HTTP_STATUS_CODES.BAD_REQUEST
        });
    }

    if (autoRenew === undefined) {
        req.body.autoRenew = true;
    }

    req.body.status = 'active';

    next();
})

export const validateProfileUpdate = wrapRequestHandler((req: Request, res: Response, next: NextFunction) => {
    const allowedFields = ['username', 'avatar_url', 'date_of_birth'];
    const updates = req.body;

    // Check if there are any fields to update
    if (Object.keys(updates).length === 0) {
        throw new ErrorWithStatus({
            message: 'No fields provided for update',
            status: HTTP_STATUS_CODES.BAD_REQUEST
        });
    }

    // Check for invalid fields
    const invalidFields = Object.keys(updates).filter(field => !allowedFields.includes(field));
    if (invalidFields.length > 0) {
        throw new ErrorWithStatus({
            message: `Invalid fields provided: ${invalidFields.join(', ')}. Only ${allowedFields.join(', ')} can be updated.`,
            status: HTTP_STATUS_CODES.BAD_REQUEST
        });
    }

    // Validate username if provided
    if (updates.username !== undefined) {
        if (typeof updates.username !== 'string' || updates.username.trim().length < 3) {
            throw new ErrorWithStatus({
                message: 'Username must be a string with at least 3 characters',
                status: HTTP_STATUS_CODES.BAD_REQUEST
            });
        }
    }

    // Validate avatar_url if provided
    if (updates.avatar_url !== undefined) {
        if (typeof updates.avatar_url !== 'string' || !isValidUrl(updates.avatar_url)) {
            throw new ErrorWithStatus({
                message: 'Avatar URL must be a valid URL',
                status: HTTP_STATUS_CODES.BAD_REQUEST
            });
        }
    }

    // Validate date_of_birth if provided
    if (updates.date_of_birth !== undefined) {
        const date = new Date(updates.date_of_birth);
        if (isNaN(date.getTime())) {
            throw new ErrorWithStatus({
                message: 'Invalid date format for date_of_birth',
                status: HTTP_STATUS_CODES.BAD_REQUEST
            });
        }

        // Check if date is not in the future
        if (date > new Date()) {
            throw new ErrorWithStatus({
                message: 'Date of birth cannot be in the future',
                status: HTTP_STATUS_CODES.BAD_REQUEST
            });
        }

        // Check if age is reasonable (e.g., not more than 120 years)
        const age = calculateAge(date);
        if (age > 120) {
            throw new ErrorWithStatus({
                message: 'Invalid date of birth: Age cannot be more than 120 years',
                status: HTTP_STATUS_CODES.BAD_REQUEST
            });
        }
    }

    // Remove any undefined fields
    const filteredUpdates = Object.fromEntries(
        Object.entries(updates).filter(([_, value]) => value !== undefined)
    );

    // Store filtered updates in request for the controller to use
    req.body = filteredUpdates;

    next();
});

// Helper function to validate URL
function isValidUrl(string: string): boolean {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}

// Helper function to calculate age
function calculateAge(birthDate: Date): number {
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }

    return age;
} 