import { Request, Response, NextFunction } from 'express';
import redisClient from '~/config/redis';
import { ErrorWithStatus } from '~/utils/error.utils';
import HTTP_STATUS_CODES from '~/core/statusCodes';
import { TokenPayload } from '~/models/requests/user.request';
import { IUser } from '~/models/schemas/user.schema';
import { USER_MESSAGES } from '~/constants/messages';

// Helper function to check if user is premium
const isPremiumUser = (user: IUser | string | null): boolean => {
    if (!user || typeof user === 'string') return false;
    return user.tier === 'premium' || (user.subscription && user.subscription.plan.includes('premium'));
};

/**
 * Rate limiter middleware using Redis
 * @param {number} maxRequests - Maximum number of requests in the time window
 * @param {number} windowMs - Time window in milliseconds
 * @param {string} prefix - Redis key prefix to categorize different types of rate limits
 */
export const rateLimiter = (maxRequests: number, windowMs: number, prefix: string) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            // Get Redis client instance (this now properly awaits the promise)
            const redis = await redisClient;
            if (!redis) {
                console.error('Redis client not available');
                return next(); // Allow the request to proceed if Redis is not available
            }

            // Get client IP address and clean it
            const rawIp = req.ip ||
                (typeof req.headers['x-forwarded-for'] === 'string' ?
                    req.headers['x-forwarded-for'] :
                    Array.isArray(req.headers['x-forwarded-for']) ?
                        req.headers['x-forwarded-for'][0] : '') ||
                req.socket.remoteAddress || '';
            const ip = rawIp.split(',')[0].trim();

            console.log('Client IP:', ip);

            // For auth endpoints, use email as identifier if available
            const email = req.body.email ? req.body.email.toLowerCase() : '';

            // Create identifiers for both IP-based and email-based rate limiting
            const ipIdentifier = `${prefix}:ip:${ip}`;
            const emailIdentifier = email ? `${prefix}:email:${email}` : '';
            const combinedIdentifier = email ? `${prefix}:combined:${email}:${ip}` : '';

            // Check if this IP or email is already marked as suspicious
            const ipSuspicious = await redis.exists(`${ipIdentifier}:suspicious`);
            const emailSuspicious = email ? await redis.exists(`${emailIdentifier}:suspicious`) : 0;

            if (ipSuspicious || emailSuspicious) {
                // If suspicious, apply a much stricter limit
                maxRequests = Math.floor(maxRequests / 3);

                // Log suspicious activity
                console.warn(`Suspicious activity detected - IP: ${ip}${email ? `, Email: ${email}` : ''}`);
            }

            // Use Redis's rateLimiter method which now includes pattern detection
            const [ipAllowed, emailAllowed, combinedAllowed] = await Promise.all([
                redis.rateLimiter(ipIdentifier, maxRequests, Math.floor(windowMs / 1000)),
                email ? redis.rateLimiter(emailIdentifier, maxRequests, Math.floor(windowMs / 1000)) : true,
                combinedIdentifier ? redis.rateLimiter(combinedIdentifier, maxRequests, Math.floor(windowMs / 1000)) : true
            ]);

            // Get current counts
            const [ipCount, emailCount, combinedCount] = await Promise.all([
                redis.get(`${ipIdentifier}:count`),
                email ? redis.get(`${emailIdentifier}:count`) : '0',
                combinedIdentifier ? redis.get(`${combinedIdentifier}:count`) : '0'
            ]);

            // Convert counts to numbers
            const counts = {
                ip: parseInt(ipCount || '0'),
                email: parseInt(emailCount || '0'),
                combined: parseInt(combinedCount || '0')
            };

            // Get TTLs
            const [ipTTL, emailTTL, combinedTTL] = await Promise.all([
                redis.ttl(`${ipIdentifier}:count`),
                email ? redis.ttl(`${emailIdentifier}:count`) : 0,
                combinedIdentifier ? redis.ttl(`${combinedIdentifier}:count`) : 0
            ]);

            // Set rate limit headers using the most restrictive count
            const currentCount = Math.max(counts.ip, counts.email, counts.combined);
            res.setHeader('X-RateLimit-Limit', maxRequests);
            res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - currentCount));

            // Use the maximum TTL for the Retry-After header
            const maxTTL = Math.max(ipTTL, emailTTL, combinedTTL);
            res.setHeader('Retry-After', maxTTL);

            // If any limiter returns false, block the request
            if (!ipAllowed || !emailAllowed || !combinedAllowed) {
                // Track failed attempts
                const blockKey = `${prefix}:blocked:${ip}`;
                await redis.incr(blockKey);
                await redis.expire(blockKey, 24 * 60 * 60); // Keep for 24 hours

                // Get number of times this IP has been blocked
                const blockCount = parseInt(await redis.get(blockKey) || '0');

                // If blocked too many times, mark as suspicious
                if (blockCount >= 3) {
                    await redis.set(`${ipIdentifier}:suspicious`, '1', {
                        EX: 24 * 60 * 60 // Keep suspicious flag for 24 hours
                    });
                    if (email) {
                        await redis.set(`${emailIdentifier}:suspicious`, '1', {
                            EX: 24 * 60 * 60
                        });
                    }
                }

                throw new ErrorWithStatus({
                    message: blockCount >= 3 ?
                        'Access temporarily blocked due to suspicious activity' :
                        USER_MESSAGES.RATE_LIMIT_EXCEEDED,
                    status: HTTP_STATUS_CODES.TOO_MANY_REQUESTS
                });
            }

            next();
        } catch (error) {
            if (error instanceof ErrorWithStatus) {
                next(error);
            } else {
                console.error('Rate limiter error:', error);
                next();
            }
        }
    };
};

// Specific rate limiters with stricter limits
export const registerRateLimiter = rateLimiter(5, 60 * 60 * 1000, 'register'); // 5 requests per hour
export const loginRateLimiter = rateLimiter(5, 15 * 60 * 1000, 'login'); // 5 requests per 15 minutes
export const resendEmailRateLimiter = rateLimiter(3, 60 * 60 * 1000, 'resend-email'); // 3 requests per hour

// General rate limiter for API endpoints
export const generalRateLimiter = (limit: number, windowMs: number) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            // Get Redis client instance (this now properly awaits the promise)
            const redis = await redisClient;
            if (!redis) {
                console.error('Redis client not available');
                return next(); // Allow the request to proceed if Redis is not available
            }

            // Determine identifier (IP address or user ID if authenticated)
            let identifier = req.ip;

            // If user is authenticated, use their ID instead of IP
            if (req.decoded_authorization) {
                const { user_id } = req.decoded_authorization as TokenPayload;
                identifier = user_id;
            }

            // Create a rate limiter key with the endpoint path
            const path = req.path;
            const method = req.method;
            const key = `rate-limit:${identifier}:${method}:${path}`;

            // Check if the rate limit is exceeded
            const allowed = await redis.rateLimiter(key, limit, Math.floor(windowMs / 1000));

            if (!allowed) {
                throw new ErrorWithStatus({
                    message: 'Too many requests, please try again later.',
                    status: HTTP_STATUS_CODES.TOO_MANY_REQUESTS
                });
            }

            // Set rate limit headers
            const count = await redis.get(key);
            const ttl = await redis.ttl(`${key}`);
            const remaining = limit - parseInt(count || '0');

            res.set({
                'X-RateLimit-Limit': limit.toString(),
                'X-RateLimit-Remaining': remaining.toString(),
                'X-RateLimit-Reset': (Math.floor(Date.now() / 1000) + ttl).toString()
            });

            next();
        } catch (error) {
            next(error);
        }
    };
};

// Premium user rate limiter (higher limits)
export const premiumRateLimiter = (regularLimit: number, premiumLimit: number, windowMs: number) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            // Get Redis client instance (this now properly awaits the promise)
            const redis = await redisClient;
            if (!redis) {
                console.error('Redis client not available');
                return next(); // Allow the request to proceed if Redis is not available
            }

            // Determine if user is premium
            let isPremium = false;
            let identifier = req.ip;

            if (req.decoded_authorization) {
                const { user_id } = req.decoded_authorization as TokenPayload;
                identifier = user_id;

                // Get user from cache or database
                const userCache = await redis.getObject<IUser>(`user:${user_id}`);
                if (userCache) {
                    isPremium = isPremiumUser(userCache);

                    // Check subscription status for premium users
                    if (isPremium && userCache.subscription && userCache.subscription.status !== 'active') {
                        isPremium = false; // Treat as regular user if subscription is not active
                    }
                }
            }

            // Apply appropriate rate limit based on user type
            const limit = isPremium ? premiumLimit : regularLimit;

            // Create a rate limiter key with the endpoint path
            const path = req.path;
            const method = req.method;
            const key = `rate-limit:${identifier}:${method}:${path}`;

            // Check if the rate limit is exceeded
            const allowed = await redis.rateLimiter(key, limit, Math.floor(windowMs / 1000));

            if (!allowed) {
                throw new ErrorWithStatus({
                    message: isPremium ?
                        'Premium rate limit exceeded. Please try again later.' :
                        'Rate limit exceeded. Please upgrade to premium for higher limits.',
                    status: HTTP_STATUS_CODES.TOO_MANY_REQUESTS
                });
            }

            // Set rate limit headers
            const count = await redis.get(key);
            const ttl = await redis.ttl(`${key}`);
            const remaining = limit - parseInt(count || '0');

            res.set({
                'X-RateLimit-Limit': limit.toString(),
                'X-RateLimit-Remaining': remaining.toString(),
                'X-RateLimit-Reset': (Math.floor(Date.now() / 1000) + ttl).toString()
            });

            next();
        } catch (error) {
            next(error);
        }
    };
};

// AI request rate limiter (different limits for free vs premium users)
export const aiRequestRateLimiter = (freeLimit: number, premiumLimit: number, windowMs: number) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            if (!req.decoded_authorization) {
                throw new ErrorWithStatus({
                    message: 'Authentication required for AI requests',
                    status: HTTP_STATUS_CODES.UNAUTHORIZED
                });
            }

            // Get Redis client instance (this now properly awaits the promise)
            const redis = await redisClient;
            if (!redis) {
                console.error('Redis client not available');
                return next(); // Allow the request to proceed if Redis is not available
            }

            const { user_id } = req.decoded_authorization as TokenPayload;

            // Get user from cache or database
            const userCache = await redis.getObject<IUser>(`user:${user_id}`);
            const isPremium = isPremiumUser(userCache);

            // Check subscription status for premium users
            if (isPremium && userCache && userCache.subscription && userCache.subscription.status !== 'active') {
                throw new ErrorWithStatus({
                    message: 'Your premium subscription has expired. Please renew to continue using AI features.',
                    status: HTTP_STATUS_CODES.PAYMENT_REQUIRED
                });
            }

            // Apply appropriate rate limit based on user type
            const limit = isPremium ? premiumLimit : freeLimit;

            // Create a rate limiter key for AI requests
            const key = `rate-limit:ai:${user_id}`;

            // Check if the rate limit is exceeded
            const allowed = await redis.rateLimiter(key, limit, Math.floor(windowMs / 1000));

            if (!allowed) {
                throw new ErrorWithStatus({
                    message: isPremium ?
                        'Premium AI request limit exceeded. Please try again tomorrow.' :
                        'Free tier AI request limit exceeded. Please upgrade to premium for more requests.',
                    status: HTTP_STATUS_CODES.TOO_MANY_REQUESTS
                });
            }

            // Log premium feature access to monitor for abuse
            if (isPremium && userCache) {
                logPremiumAccess(req, userCache, 'ai_request', redis).catch(
                    err => console.error('Error logging premium access:', err)
                );
            }

            // Set rate limit headers
            const count = await redis.get(key);
            const ttl = await redis.ttl(`${key}`);
            const remaining = limit - parseInt(count || '0');

            res.set({
                'X-RateLimit-Limit': limit.toString(),
                'X-RateLimit-Remaining': remaining.toString(),
                'X-RateLimit-Reset': (Math.floor(Date.now() / 1000) + ttl).toString()
            });

            next();
        } catch (error) {
            next(error);
        }
    };
};

// Helper function to log premium feature access
async function logPremiumAccess(req: Request, user: IUser, feature: string, redis: any) {
    // Get client IP and user agent
    const ip = req.ip ||
        (typeof req.headers['x-forwarded-for'] === 'string' ?
            req.headers['x-forwarded-for'] :
            Array.isArray(req.headers['x-forwarded-for']) ?
                req.headers['x-forwarded-for'][0] : '') ||
        req.socket.remoteAddress || 'unknown';

    const userAgent = req.headers['user-agent'] || 'unknown';
    const cleanIp = ip.split(',')[0].trim();

    // Create log entry
    const logEntry = {
        feature,
        timestamp: new Date(),
        ip: cleanIp,
        userAgent,
        path: req.path,
        method: req.method
    };

    // Add to user's premium access log in Redis
    const logKey = `premium-access-log:${user._id}`;
    await redis.lPush(logKey, JSON.stringify(logEntry));
    await redis.lTrim(logKey, 0, 99); // Keep only last 100 entries
    await redis.expire(logKey, 30 * 24 * 60 * 60); // Keep for 30 days

    // Also store in user model if available
    if (!user.usage) {
        user.usage = {
            createdResumes: 0,
            aiRequestsCount: 0,
            exportsCount: {
                pdf: 0,
                docx: 0,
                png: 0
            },

        };
    }

    // // Add simplified log entry to match schema structure
    // user.usage.premiumAccessLog.push({
    //     feature,
    //     timestamp: new Date(),
    //     ip: cleanIp,
    //     userAgent
    // });

    // // If log is getting too big, trim it
    // if (user.usage.premiumAccessLog.length > 100) {
    //     user.usage.premiumAccessLog = user.usage.premiumAccessLog.slice(-100);
    // }

    // Increment AI requests counter if it's an AI-related feature
    if (feature.includes('ai')) {
        user.usage.aiRequestsCount = (user.usage.aiRequestsCount || 0) + 1;
    }
}

