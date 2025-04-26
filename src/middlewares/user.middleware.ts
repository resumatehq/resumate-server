import { Request, Response, NextFunction } from 'express';
import { ErrorWithStatus } from '~/utils/error.utils';
import HTTP_STATUS_CODES from '~/core/statusCodes';
import { wrapRequestHandler } from '~/utils/wrapHandler';

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
    const allowedFields = [
        'username', 'avatar_url', 'date_of_birth',
        'bio', 'industry', 'experience', 'location', 'phone',
        'social_links'
    ];
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

    // Validate bio if provided
    if (updates.bio !== undefined && updates.bio !== null) {
        if (typeof updates.bio !== 'string') {
            throw new ErrorWithStatus({
                message: 'Bio must be a string',
                status: HTTP_STATUS_CODES.BAD_REQUEST
            });
        }
        if (updates.bio.length > 500) {
            throw new ErrorWithStatus({
                message: 'Bio cannot exceed 500 characters',
                status: HTTP_STATUS_CODES.BAD_REQUEST
            });
        }
    }

    // Validate industry if provided
    if (updates.industry !== undefined && updates.industry !== null) {
        if (typeof updates.industry !== 'string') {
            throw new ErrorWithStatus({
                message: 'Industry must be a string',
                status: HTTP_STATUS_CODES.BAD_REQUEST
            });
        }
    }

    // Validate experience if provided
    if (updates.experience !== undefined && updates.experience !== null) {
        if (typeof updates.experience !== 'string') {
            throw new ErrorWithStatus({
                message: 'Experience must be a string',
                status: HTTP_STATUS_CODES.BAD_REQUEST
            });
        }
    }

    // Validate location if provided
    if (updates.location !== undefined && updates.location !== null) {
        if (typeof updates.location !== 'string') {
            throw new ErrorWithStatus({
                message: 'Location must be a string',
                status: HTTP_STATUS_CODES.BAD_REQUEST
            });
        }
    }

    // Validate phone if provided
    if (updates.phone !== undefined && updates.phone !== null) {
        if (typeof updates.phone !== 'string') {
            throw new ErrorWithStatus({
                message: 'Phone must be a string',
                status: HTTP_STATUS_CODES.BAD_REQUEST
            });
        }
        // Basic phone number validation (optional)
        const phoneRegex = /^[+]?[(]?[0-9]{1,4}[)]?[-\s./0-9]*$/;
        if (!phoneRegex.test(updates.phone)) {
            throw new ErrorWithStatus({
                message: 'Invalid phone number format',
                status: HTTP_STATUS_CODES.BAD_REQUEST
            });
        }
    }

    // Validate social_links if provided
    if (updates.social_links !== undefined && updates.social_links !== null) {
        if (typeof updates.social_links !== 'object' || updates.social_links === null) {
            throw new ErrorWithStatus({
                message: 'Social links must be an object',
                status: HTTP_STATUS_CODES.BAD_REQUEST
            });
        }

        const allowedSocialLinks = ['linkedin', 'github', 'twitter', 'website'];
        const providedSocialLinks = Object.keys(updates.social_links);

        // Check for invalid social link types
        const invalidSocialLinks = providedSocialLinks.filter(link => !allowedSocialLinks.includes(link));
        if (invalidSocialLinks.length > 0) {
            throw new ErrorWithStatus({
                message: `Invalid social links provided: ${invalidSocialLinks.join(', ')}. Only ${allowedSocialLinks.join(', ')} are allowed.`,
                status: HTTP_STATUS_CODES.BAD_REQUEST
            });
        }

        // Validate each provided social link URL
        for (const [platform, url] of Object.entries(updates.social_links)) {
            if (url !== undefined && url !== null && typeof url === 'string' && url.trim() !== '') {
                if (!isValidUrl(url)) {
                    throw new ErrorWithStatus({
                        message: `Invalid URL format for ${platform}`,
                        status: HTTP_STATUS_CODES.BAD_REQUEST
                    });
                }
            }
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