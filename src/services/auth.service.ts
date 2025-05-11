'use strict'

import { ObjectId } from 'mongodb'
import { LoginReqBody, RegisterReqBody } from '~/models/requests/user.request'
import { IUser, defaultUserStructure } from '~/models/schemas/user.schema'
import { envConfig } from '~/constants/config'
import bcrypt from 'bcrypt'
import { signToken, verifyToken } from '~/utils/token.utils'
import { Token } from '~/models/schemas/token.schema'
import { ErrorWithStatus } from '~/utils/error.utils'
import { TOKEN_MESSAGES, USER_MESSAGES } from '~/constants/messages'
import HTTP_STATUS_CODES from '~/core/statusCodes'
import databaseServices from './database.service'
import { tokenType, userVerificationStatus } from '~/constants/enums'
import emailService from './email.service'
import redisClient from '~/config/redis';
import cacheService from './cache.service'
import { update } from 'lodash'
import { logger } from '~/loggers/my-logger.log'

class AuthService {
  private signAccessToken({
    user_id,
    verify,
    tier
  }: {
    user_id: string
    verify: userVerificationStatus
    tier: string
  }) {
    return signToken({
      payload: {
        user_id,
        token_type: tokenType.AccessToken,
        verify,
        tier
      },
      privateKey: envConfig.jwtSecretAccessToken,
      options: {
        expiresIn: envConfig.accessTokenExpiresIn
      }
    })
  }

  private signRefreshToken({
    user_id,
    verify,
    exp,
    tier
  }: {
    user_id: string
    verify: userVerificationStatus
    exp?: number
    tier: string
  }) {
    if (exp) {
      return signToken({
        payload: {
          user_id,
          token_type: tokenType.RefreshToken,
          verify,
          exp,
          tier
        },
        privateKey: envConfig.jwtSecretRefreshToken,
        options: {
          expiresIn: exp
        }
      })
    }
    return signToken({
      payload: {
        user_id,
        token_type: tokenType.RefreshToken,
        verify,
        tier
      },
      privateKey: envConfig.jwtSecretRefreshToken,
      options: {
        expiresIn: envConfig.refreshTokenExpiresIn
      }
    })
  }

  private signEmailVerifyToken({
    user_id,
    verify,
    tier
  }: {
    user_id: string
    verify: userVerificationStatus
    tier: string
  }) {
    return signToken({
      payload: {
        user_id,
        token_type: tokenType.EmailVerificationToken,
        verify,
        tier
      },
      privateKey: envConfig.jwtSecretEmailVerifyToken,
      options: {
        expiresIn: envConfig.emailVerifyTokenExpiresIn
      }
    })
  }

  private decodeEmailVerifyToken(email_verify_token: string) {
    return verifyToken({
      token: email_verify_token,
      secretOrPublickey: envConfig.jwtSecretEmailVerifyToken
    })
  }

  async decodeRefreshToken(refresh_token: string) {
    return verifyToken({
      token: refresh_token,
      secretOrPublickey: envConfig.jwtSecretRefreshToken
    })
  }

  async signAccessAndRefreshToken({
    user_id,
    verify,
    tier
  }: {
    user_id: string
    verify: userVerificationStatus
    tier: string
  }) {
    return Promise.all([
      this.signAccessToken({ user_id, verify, tier }),
      this.signRefreshToken({ user_id, verify, tier })
    ])
  }

  async register(payload: RegisterReqBody) {
    const user_id = new ObjectId()
    const salt = 10
    const tier = 'free'

    // Tạo mã token xác minh email và hash password đồng thời
    const [email_verify_token, hashedPassword] = await Promise.all([
      this.signEmailVerifyToken({
        user_id: user_id.toString(),
        verify: userVerificationStatus.Unverified,
        tier
      }),
      bcrypt.hash(payload.password, salt)
    ]);

    const { confirm_password, avatar_url, ...userData } = payload

    const newUser: IUser = {
      _id: user_id,
      ...userData,
      ...defaultUserStructure,
      password: hashedPassword,
      avatar_url: avatar_url || null
    } as IUser

    const { iat: iat_email_verify_token, exp: exp_email_verify_token } = await this.decodeEmailVerifyToken(
      email_verify_token
    )

    const tokenDoc = new Token({
      user_id,
      token: email_verify_token,
      type: tokenType.EmailVerificationToken,
      expires_at: new Date((exp_email_verify_token as number) * 1000),
      created_at: new Date((iat_email_verify_token as number) * 1000)
    });

    await Promise.all([
      databaseServices.users.insertOne(newUser),
      databaseServices.tokens.insertOne(tokenDoc)
    ]);

    emailService.sendVerificationEmail(payload.email, payload.username, email_verify_token)
      .then(() => {
        logger.info('Verification email sent successfully', 'AuthService.register', '', {
          userId: user_id.toString(),
          email: payload.email
        });
      })
      .catch((error) => {
        logger.error('Failed to send verification email during registration', 'AuthService.register', '', {
          userId: user_id.toString(),
          email: payload.email,
          error: error instanceof Error ? error.message : String(error)
        });
      });

    return {
      user_id: user_id.toString(),
      email: payload.email,
      username: payload.username,
      avatar_url: payload.avatar_url || '',
      email_sent: true
    }
  }

  async login(payload: LoginReqBody) {
    const { email, password } = payload

    const user = (await databaseServices.users.findOne({ email })) as {
      _id: { toString: () => string }
      password: string
      verify: userVerificationStatus
      tier: string
    }

    if (!user) {
      throw new ErrorWithStatus({
        message: USER_MESSAGES.EMAIL_OR_PASSWORD_IS_INCORRECT,
        status: HTTP_STATUS_CODES.NOT_FOUND
      })
    }

    const isPasswordMatch = await bcrypt.compare(password, user.password)

    if (!isPasswordMatch) {
      throw new ErrorWithStatus({
        message: USER_MESSAGES.EMAIL_OR_PASSWORD_IS_INCORRECT,
        status: HTTP_STATUS_CODES.UNPROCESSABLE_ENTITY
      })
    }

    logger.info('User successfully logged in', '', '', {
      email: payload.email,
      userId: user._id.toString(),
      timestamp: new Date().toISOString()
    })

    const [access_token, refresh_token] = await this.signAccessAndRefreshToken({
      user_id: user._id.toString(),
      verify: user.verify,
      tier: user.tier || 'free'
    })

    await databaseServices.users.updateOne(
      { _id: new ObjectId(user._id.toString()) },
      {
        $set: {
          last_login_time: new Date(),
          status: 'online'
        }
      }
    )

    await databaseServices.tokens.deleteMany({
      user_id: user._id,
      type: tokenType.RefreshToken
    })

    const { exp } = await this.decodeRefreshToken(refresh_token)

    await databaseServices.tokens.insertOne(
      new Token({
        user_id: user._id.toString(),
        token: refresh_token,
        type: tokenType.RefreshToken,
        expires_at: new Date(exp * 1000)
      })
    )

    // Fetch complete user data for response
    const userResponse = await databaseServices.users.findOne(
      { _id: new ObjectId(user._id.toString()) },
      {
        projection: {
          password: 0,
          forgot_password_token: 0,
          email_verify_token: 0,
          forgot_password: 0
        }
      }
    )

    if (!userResponse) {
      throw new ErrorWithStatus({
        status: HTTP_STATUS_CODES.NOT_FOUND,
        message: USER_MESSAGES.USER_NOT_FOUND
      })
    }

    // Store updated user in Redis cache
    const redis = await redisClient;
    await redis.setObject(`user:${user._id.toString()}`, userResponse, 1800);

    return {
      access_token,
      refresh_token,
      user: userResponse
    }
  }

  async googleLogin(user: any) {
    if (!user) {
      throw new ErrorWithStatus({
        status: HTTP_STATUS_CODES.UNAUTHORIZED,
        message: USER_MESSAGES.USER_NOT_FOUND
      });
    }

    // Đảm bảo người dùng luôn được verify khi đăng nhập bằng Google
    await databaseServices.users.updateOne(
      { _id: new ObjectId(user._id) },
      {
        $set: {
          verify: userVerificationStatus.Verified,
          last_login_time: new Date(),
          status: 'online',
          updated_at: new Date()
        }
      }
    );

    logger.info(`Google login attempt for user: ${user.email}`, 'AuthService.googleLogin', '', {
      userId: user._id.toString(),
      email: user.email
    });

    // Lấy thông tin user đã cập nhật từ database
    const updatedUser = await databaseServices.users.findOne({ _id: new ObjectId(user._id) });

    if (!updatedUser) {
      logger.error('Updated user not found after Google login', 'AuthService.googleLogin', '', {
        userId: user._id.toString()
      });
      throw new ErrorWithStatus({
        status: HTTP_STATUS_CODES.NOT_FOUND,
        message: USER_MESSAGES.USER_NOT_FOUND
      });
    }

    const [access_token, refresh_token] = await this.signAccessAndRefreshToken({
      user_id: updatedUser._id.toString(),
      verify: userVerificationStatus.Verified, // Luôn sử dụng Verified cho Google login
      tier: updatedUser.tier || 'free'
    });

    await databaseServices.tokens.deleteMany({
      user_id: updatedUser._id,
      type: tokenType.RefreshToken
    });

    const { exp } = await this.decodeRefreshToken(refresh_token);

    await databaseServices.tokens.insertOne(
      new Token({
        user_id: updatedUser._id.toString(),
        token: refresh_token,
        type: tokenType.RefreshToken,
        expires_at: new Date(exp * 1000)
      })
    );

    // Fetch complete user data for response
    const userResponse = await databaseServices.users.findOne(
      { _id: new ObjectId(updatedUser._id.toString()) },
      {
        projection: {
          password: 0,
          forgot_password_token: 0,
          email_verify_token: 0,
          forgot_password: 0
        }
      }
    );

    if (!userResponse) {
      logger.error('User response not found after Google login', 'AuthService.googleLogin', '', {
        userId: updatedUser._id.toString()
      });
      throw new ErrorWithStatus({
        status: HTTP_STATUS_CODES.NOT_FOUND,
        message: USER_MESSAGES.USER_NOT_FOUND
      });
    }

    // Store updated user in Redis cache
    const redis = await redisClient;
    await redis.setObject(`user:${updatedUser._id.toString()}`, userResponse, 1800);

    logger.info('Google login successful', 'AuthService.googleLogin', '', {
      userId: updatedUser._id.toString(),
      email: updatedUser.email
    });

    return {
      access_token,
      refresh_token,
      user: userResponse
    };
  }

  async logout({ user_id, refresh_token }: { user_id: string; refresh_token: string }) {
    logger.info('User logging out', 'AuthService.logout', '', { userId: user_id })

    const redis = await redisClient;

    const expiryTime = typeof envConfig.refreshTokenExpiresIn === 'string'
      ? parseInt(envConfig.refreshTokenExpiresIn)
      : envConfig.refreshTokenExpiresIn;
    await redis.setObject(`bl_${refresh_token}`, { token: refresh_token }, expiryTime);

    // Remove user from Redis cache
    await redis.del(`user:${user_id}`);

    databaseServices.tokens.deleteOne({
      user_id: new ObjectId(user_id) as any,
      token: refresh_token,
      type: tokenType.RefreshToken
    })

    databaseServices.users.updateOne(
      { _id: new ObjectId(user_id) },
      {
        $set: {
          last_login_time: new Date(),
          status: 'offline'
        }
      }
    )

    logger.info('User logged out successfully', 'AuthService.logout', '', { userId: user_id })
  }

  async refreshToken({
    user_id,
    verify,
    tier,
    refresh_token
  }: {
    user_id: string
    verify: userVerificationStatus
    tier: string
    refresh_token: string
  }) {
    logger.info('Refreshing token', 'AuthService.refreshToken', '', { userId: user_id })

    const user = (await databaseServices.users.findOne({ _id: new ObjectId(user_id) })) as IUser

    if (!user) {
      logger.error('User not found during token refresh', 'AuthService.refreshToken', '', { userId: user_id })
      throw new ErrorWithStatus({
        status: HTTP_STATUS_CODES.NOT_FOUND,
        message: USER_MESSAGES.USER_NOT_FOUND
      })
    }

    // Update tier from database in case it has changed
    tier = user.tier || 'free'

    const token = await databaseServices.tokens.findOne({ user_id: new ObjectId(user_id), token: refresh_token })

    if (!token) {
      logger.error('Token not found during refresh', 'AuthService.refreshToken', '', { userId: user_id })
      throw new ErrorWithStatus({
        status: HTTP_STATUS_CODES.UNAUTHORIZED,
        message: TOKEN_MESSAGES.TOKEN_NOT_FOUND
      })
    }

    const { iat: iat_refresh_token, exp: exp_refresh_token } = await this.decodeRefreshToken(refresh_token)

    if (exp_refresh_token < new Date().getTime() / 1000) {
      logger.error('Token expired during refresh', 'AuthService.refreshToken', '', {
        userId: user_id,
        expiry: new Date((exp_refresh_token as number) * 1000).toISOString()
      })
      throw new ErrorWithStatus({
        status: HTTP_STATUS_CODES.UNAUTHORIZED,
        message: TOKEN_MESSAGES.TOKEN_EXPIRED
      })
    }

    // Blacklist old refresh token first
    const redis = await redisClient;
    const THIRTY_DAYS_IN_SECONDS = 7 * 24 * 60 * 60; // 7 days in seconds

    try {
      const blacklistKey = `blacklist:token:${refresh_token}`;
      const result = await redis.setObject(blacklistKey, {
        token: refresh_token,
        user_id,
        type: tokenType.RefreshToken,
        blacklisted_at: new Date().toISOString()
      }, THIRTY_DAYS_IN_SECONDS);

      if (!result) {
        throw new Error('Failed to set blacklist in Redis');
      }

      logger.info('Old refresh token blacklisted successfully', 'AuthService.refreshToken', '', {
        userId: user_id,
        blacklistKey
      });
    } catch (error) {
      logger.error('Failed to blacklist old refresh token', 'AuthService.refreshToken', '', {
        userId: user_id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw new ErrorWithStatus({
        status: HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR,
        message: TOKEN_MESSAGES.TOKEN_BLACKLIST_FAILED
      });
    }

    // Delete old refresh token from database
    try {
      await databaseServices.tokens.deleteOne({ _id: token._id })
      logger.info('Old refresh token deleted from database', 'AuthService.refreshToken', '', { userId: user_id })
    } catch (error) {
      logger.error('Failed to delete old refresh token from database', 'AuthService.refreshToken', '', {
        userId: user_id,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      // Even if database deletion fails, continue since token is blacklisted
    }

    // Generate new tokens only after successful blacklisting
    const [access_token, new_refresh_token] = await this.signAccessAndRefreshToken({
      user_id: user_id,
      verify,
      tier
    })

    const { exp: new_exp_refresh_token } = await this.decodeRefreshToken(new_refresh_token)

    try {
      await databaseServices.tokens.insertOne(
        new Token({
          user_id: new ObjectId(user_id),
          token: new_refresh_token,
          type: tokenType.RefreshToken,
          expires_at: new Date((new_exp_refresh_token as number) * 1000),
          created_at: new Date((iat_refresh_token as number) * 1000)
        })
      )
      logger.info('New refresh token stored in database', 'AuthService.refreshToken', '', { userId: user_id })
    } catch (error) {
      logger.error('Failed to store new refresh token in database', 'AuthService.refreshToken', '', {
        userId: user_id,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      throw new ErrorWithStatus({
        status: HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR,
        message: TOKEN_MESSAGES.TOKEN_CREATION_FAILED
      })
    }

    logger.info('Token refreshed successfully', 'AuthService.refreshToken', '', { userId: user_id })

    // Fetch updated user data for response
    const userResponse = await databaseServices.users.findOne(
      { _id: new ObjectId(user_id) },
      {
        projection: {
          password: 0,
          forgot_password_token: 0,
          email_verify_token: 0,
          forgot_password: 0
        }
      }
    )

    if (!userResponse) {
      logger.error('User not found after token refresh', 'AuthService.refreshToken', '', { userId: user_id })
      throw new ErrorWithStatus({
        status: HTTP_STATUS_CODES.NOT_FOUND,
        message: USER_MESSAGES.USER_NOT_FOUND
      })
    }

    // Update user in Redis cache
    await redis.setObject(`user:${user_id}`, userResponse, 1800);

    return {
      access_token,
      refresh_token: new_refresh_token,
      user: userResponse
    }
  }

  async verifyEmail(email_verify_token: string) {
    // Verify the token
    const decode_email_verify_token = await this.decodeEmailVerifyToken(email_verify_token)
    const { user_id } = decode_email_verify_token

    logger.info('Verifying email', 'AuthService.verifyEmail', '', { userId: user_id })

    const user = (await databaseServices.users.findOne({ _id: new ObjectId(user_id) })) as IUser
    if (!user) {
      logger.error('User not found during email verification', 'AuthService.verifyEmail', '', { userId: user_id })
      throw new ErrorWithStatus({
        status: HTTP_STATUS_CODES.NOT_FOUND,
        message: USER_MESSAGES.USER_NOT_FOUND
      })
    }

    // Check if user is already verified
    if (user.verify === userVerificationStatus.Verified) {
      logger.warn('Email already verified', 'AuthService.verifyEmail', '', {
        userId: user_id,
        email: user.email
      })
      throw new ErrorWithStatus({
        status: HTTP_STATUS_CODES.BAD_REQUEST,
        message: USER_MESSAGES.EMAIL_ALREADY_VERIFIED_BEFORE
      })
    }

    // Find the verification token
    const tokenInDB = await databaseServices.tokens.findOne({
      token: email_verify_token,
      user_id: new ObjectId(user_id),
      type: tokenType.EmailVerificationToken
    })

    if (!tokenInDB) {
      logger.error('Verification token not found', 'AuthService.verifyEmail', '', { userId: user_id })
      throw new ErrorWithStatus({
        status: HTTP_STATUS_CODES.UNAUTHORIZED,
        message: TOKEN_MESSAGES.TOKEN_NOT_FOUND
      })
    }

    // Check if token is expired
    if (tokenInDB.expires_at.getTime() < new Date().getTime()) {
      logger.error('Verification token expired', 'AuthService.verifyEmail', '', {
        userId: user_id,
        expiry: tokenInDB.expires_at.toISOString()
      })
      throw new ErrorWithStatus({
        status: HTTP_STATUS_CODES.UNAUTHORIZED,
        message: TOKEN_MESSAGES.TOKEN_EXPIRED
      })
    }

    // Update user's verification status
    await databaseServices.users.updateOne(
      { _id: new ObjectId(user_id) },
      {
        $set: {
          verify: userVerificationStatus.Verified
        }
      }
    )

    await databaseServices.tokens.deleteOne({ _id: tokenInDB._id })
    await databaseServices.tokens.deleteOne({
      user_id: new ObjectId(user_id),
      type: tokenType.RefreshToken
    })

    // Generate new access and refresh tokens
    const [access_token, refresh_token] = await this.signAccessAndRefreshToken({
      user_id,
      verify: userVerificationStatus.Verified,
      tier: user.tier || 'free'
    })

    const { exp } = await this.decodeRefreshToken(refresh_token)

    // Save the new refresh token
    await databaseServices.tokens.insertOne(
      new Token({
        user_id: new ObjectId(user_id),
        token: refresh_token,
        type: tokenType.RefreshToken,
        expires_at: new Date((exp as number) * 1000)
      })
    )

    // Fetch updated user data for response
    const userResponse = await databaseServices.users.findOne(
      { _id: new ObjectId(user_id) },
      {
        projection: {
          password: 0,
          forgot_password_token: 0,
          email_verify_token: 0,
          forgot_password: 0
        }
      }
    )

    if (!userResponse) {
      logger.error('User not found after email verification', 'AuthService.verifyEmail', '', { userId: user_id })
      throw new ErrorWithStatus({
        status: HTTP_STATUS_CODES.NOT_FOUND,
        message: USER_MESSAGES.USER_NOT_FOUND
      })
    }

    // Update user in Redis cache
    const redis = await redisClient;
    await redis.setObject(`user:${user_id}`, userResponse, 1800);

    logger.info('Email verified successfully', 'AuthService.verifyEmail', '', {
      userId: user_id,
      email: user.email
    })

    return {
      access_token,
      refresh_token,
      user: userResponse
    }
  }

  async resendVerificationEmail(email: string) {
    logger.info('Resending verification email', 'AuthService.resendVerificationEmail', '', { email })

    // Find the user by email
    const user = (await databaseServices.users.findOne({ email })) as IUser

    if (!user) {
      logger.error('User not found during resend verification', 'AuthService.resendVerificationEmail', '', { email })
      throw new ErrorWithStatus({
        status: HTTP_STATUS_CODES.NOT_FOUND,
        message: USER_MESSAGES.EMAIL_NOT_EXIST
      })
    }

    // Check if user is already verified
    if (user.verify === userVerificationStatus.Verified) {
      logger.warn('Email already verified', 'AuthService.resendVerificationEmail', '', {
        email,
        userId: user._id?.toString() || 'unknown'
      })
      throw new ErrorWithStatus({
        status: HTTP_STATUS_CODES.BAD_REQUEST,
        message: USER_MESSAGES.EMAIL_ALREADY_VERIFIED_BEFORE
      })
    }

    // Find any existing verification tokens
    const existingTokens = await databaseServices.tokens.find({
      user_id: user._id,
      type: tokenType.EmailVerificationToken
    }).toArray()

    // Blacklist existing tokens
    if (existingTokens.length > 0) {
      const redis = await redisClient;
      const THIRTY_DAYS_IN_SECONDS = 30 * 24 * 60 * 60; // 30 days in seconds

      try {
        // Blacklist all existing tokens
        await Promise.all(existingTokens.map(async (token) => {
          const blacklistKey = `blacklist:token:${token.token}`;
          const result = await redis.setObject(blacklistKey, {
            token: token.token,
            user_id: user._id?.toString(),
            type: tokenType.EmailVerificationToken,
            blacklisted_at: new Date().toISOString()
          }, THIRTY_DAYS_IN_SECONDS);

          if (!result) {
            throw new Error('Failed to set blacklist in Redis');
          }

          logger.info('Old verification token blacklisted', 'AuthService.resendVerificationEmail', '', {
            email,
            userId: user._id?.toString() || 'unknown',
            tokenId: (token._id as ObjectId).toString(),
            blacklistKey
          });
        }));
      } catch (error) {
        logger.error('Failed to blacklist old verification tokens', 'AuthService.resendVerificationEmail', '', {
          email,
          userId: user._id?.toString() || 'unknown',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        throw new ErrorWithStatus({
          status: HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR,
          message: TOKEN_MESSAGES.TOKEN_BLACKLIST_FAILED
        });
      }
    }

    // Delete existing verification tokens from database
    try {
      await databaseServices.tokens.deleteMany({
        user_id: user._id,
        type: tokenType.EmailVerificationToken
      });
      logger.info('Old verification tokens deleted from database', 'AuthService.resendVerificationEmail', '', {
        email,
        userId: user._id?.toString() || 'unknown'
      });
    } catch (error) {
      logger.error('Failed to delete old verification tokens from database', 'AuthService.resendVerificationEmail', '', {
        email,
        userId: user._id?.toString() || 'unknown',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      // Continue since tokens are blacklisted
    }

    // Generate a new verification token
    const email_verify_token = await this.signEmailVerifyToken({
      user_id: user._id?.toString() || '',
      verify: userVerificationStatus.Unverified,
      tier: user.tier || 'free'
    })

    // Decode the token to get expiration time
    const { iat, exp } = await this.decodeEmailVerifyToken(email_verify_token)

    // Save the new token
    try {
      await databaseServices.tokens.insertOne(
        new Token({
          user_id: user._id,
          token: email_verify_token,
          type: tokenType.EmailVerificationToken,
          expires_at: new Date((exp as number) * 1000),
          created_at: new Date((iat as number) * 1000)
        })
      );
      logger.info('New verification token stored in database', 'AuthService.resendVerificationEmail', '', {
        email,
        userId: user._id?.toString() || 'unknown'
      });
    } catch (error) {
      logger.error('Failed to store new verification token', 'AuthService.resendVerificationEmail', '', {
        email,
        userId: user._id?.toString() || 'unknown',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw new ErrorWithStatus({
        status: HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR,
        message: TOKEN_MESSAGES.TOKEN_CREATION_FAILED
      });
    }

    // Send the verification email
    await emailService.sendVerificationEmail(user.email, user.username, email_verify_token)

    logger.info('Verification email resent successfully', 'AuthService.resendVerificationEmail', '', {
      email,
      userId: user._id?.toString() || 'unknown'
    })

    return true
  }
}
const authService = new AuthService()
export default authService
