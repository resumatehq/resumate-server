// config/redis.ts
import { createClient } from 'redis';
import { envConfig } from '~/constants/config';

type RedisCommandSignature<T> = (...args: any[]) => Promise<T>;

interface RedisClientType {
    connect: () => Promise<void>;
    disconnect: () => Promise<void>;
    setWithExpiry: (key: string, value: string, expireSeconds?: number) => Promise<boolean>;
    setObject: (key: string, obj: Record<string, unknown> | unknown[], expireSeconds?: number) => Promise<boolean>;
    get: RedisCommandSignature<string | null>;
    getObject: <T>(key: string) => Promise<T | null>;
    del: RedisCommandSignature<number>;
    exists: RedisCommandSignature<number>;
    flushAll: RedisCommandSignature<string>;
    keys: RedisCommandSignature<string[]>;
    incr: RedisCommandSignature<number>;
    expire: RedisCommandSignature<boolean>;
    ttl: RedisCommandSignature<number>;
    rateLimiter: (key: string, limit: number, windowSeconds: number) => Promise<boolean>;
    set: (key: string, value: string, options?: { EX?: number }) => Promise<string | null>;
    lPush: RedisCommandSignature<number>;
    lTrim: RedisCommandSignature<string | null>;
    lRange: RedisCommandSignature<string[]>;
}

let redisClientInstance: RedisClientType | null = null;
let connectionPromise: Promise<RedisClientType> | null = null;

// Redis client initialization - lazy loading pattern with proper promise handling
const initializeRedisClient = (): Promise<RedisClientType> => {
    if (connectionPromise) {
        return connectionPromise;
    }

    connectionPromise = (async () => {
        if (redisClientInstance) {
            return redisClientInstance;
        }

        console.log('Initializing Redis connection to:', envConfig.redisUrl);

        const client = createClient({
            url: envConfig.redisUrl
        });

        // Event listeners for Redis client
        client.on('error', (err) => console.error('Redis Client Error', err));
        client.on('connect', () => console.log('Redis Client Connected'));
        client.on('ready', () => console.log('Redis Client Ready'));
        client.on('end', () => console.log('Redis Client Connection Ended'));
        client.on('reconnecting', () => console.log('Redis Client Reconnecting'));

        try {
            await client.connect();
        } catch (error) {
            console.error('Failed to connect to Redis:', error);
            connectionPromise = null;
            throw error;
        }

        const redisClient: RedisClientType = {
            connect: async () => {
                if (!client.isOpen) {
                    await client.connect();
                }
            },
            disconnect: async () => {
                if (client.isOpen) {
                    await client.disconnect();
                }
            },
            setWithExpiry: async (key, value, expireSeconds) => {
                if (expireSeconds) {
                    return await client.set(key, value, { EX: expireSeconds }) === 'OK';
                } else {
                    return await client.set(key, value) === 'OK';
                }
            },
            setObject: async (key, obj, expireSeconds) => {
                const serialized = JSON.stringify(obj);
                return await redisClient.setWithExpiry(key, serialized, expireSeconds);
            },
            get: async (key) => await client.get(key),
            getObject: async <T>(key: string): Promise<T | null> => {
                const value = await client.get(key);
                if (!value) return null;
                try {
                    return JSON.parse(value) as T;
                } catch (e) {
                    console.error('Failed to parse Redis value', e);
                    return null;
                }
            },
            del: async (key) => await client.del(key),
            exists: async (key) => await client.exists(key),
            flushAll: async () => await client.flushAll(),
            keys: async (pattern) => await client.keys(pattern),
            incr: async (key) => await client.incr(key),
            expire: async (key, seconds) => await client.expire(key, seconds),
            ttl: async (key) => await client.ttl(key),
            rateLimiter: async (key: string, limit: number, windowSeconds: number): Promise<boolean> => {
                try {
                    const now = Date.now();
                    const countKey = `${key}:count`;
                    const trackKey = `${key}:track`;

                    // Increment the counter
                    const count = await client.incr(countKey);

                    // If this is the first request in this window
                    if (count === 1) {
                        await client.expire(countKey, windowSeconds);
                    }

                    // Track request timestamps for pattern detection
                    await client.lPush(trackKey, now.toString());
                    await client.lTrim(trackKey, 0, 9); // Keep last 10 requests
                    await client.expire(trackKey, windowSeconds);

                    // Get time differences between requests
                    const timestamps = await client.lRange(trackKey, 0, -1);
                    const times = timestamps.map(t => parseInt(t));

                    // Check for suspicious patterns
                    let suspicious = false;
                    if (times.length > 1) {
                        // Check for requests that are too fast (less than 100ms apart)
                        const tooFast = times.some((time, i) => {
                            if (i === times.length - 1) return false;
                            return times[i] - times[i + 1] < 100;
                        });

                        if (tooFast) {
                            suspicious = true;
                            // Mark this IP/identifier as suspicious
                            await client.set(`${key}:suspicious`, '1', {
                                EX: 24 * 60 * 60 // Keep suspicious flag for 24 hours
                            });
                        }
                    }

                    // If suspicious or over limit, return false
                    if (suspicious || count > limit) {
                        return false;
                    }

                    return true;
                } catch (error) {
                    console.error('Redis rateLimiter error:', error);
                    return true; // Allow request on Redis error
                }
            },
            set: async (key, value, options) => {
                const result = await client.set(key, value, options);
                return result;
            },
            lPush: async (key, value) => {
                const result = await client.lPush(key, value);
                return result;
            },
            lTrim: async (key, start, stop) => {
                const result = await client.lTrim(key, start, stop);
                return result === 'OK' ? null : result;
            },
            lRange: async (key, start, stop) => {
                const result = await client.lRange(key, start, stop);
                return result || [];
            }
        };

        redisClientInstance = redisClient;
        return redisClient;
    })();

    return connectionPromise;
};

export default initializeRedisClient();