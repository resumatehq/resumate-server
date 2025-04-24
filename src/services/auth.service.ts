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

class AuthService {
  private signAccessToken({
    user_id,
    verify,
    role,
    tier
  }: {
    user_id: string
    verify: userVerificationStatus
    role: string
    tier: string
  }) {
    return signToken({
      payload: {
        user_id,
        token_type: tokenType.AccessToken,
        verify,
        role,
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
    role,
    tier
  }: {
    user_id: string
    verify: userVerificationStatus
    exp?: number
    role: string
    tier: string
  }) {
    if (exp) {
      return signToken({
        payload: {
          user_id,
          token_type: tokenType.RefreshToken,
          verify,
          exp,
          role,
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
        role,
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
    role,
    tier
  }: {
    user_id: string
    verify: userVerificationStatus
    role: string
    tier: string
  }) {
    return signToken({
      payload: {
        user_id,
        token_type: tokenType.EmailVerificationToken,
        verify,
        role,
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
    role,
    tier
  }: {
    user_id: string
    verify: userVerificationStatus
    role: string
    tier: string
  }) {
    return Promise.all([
      this.signAccessToken({ user_id, verify, role, tier }),
      this.signRefreshToken({ user_id, verify, role, tier })
    ])
  }

  async register(payload: RegisterReqBody) {
    const user_id = new ObjectId()
    const salt = 10
    const tier = 'free'

    // Tạo mã token xác minh email
    const email_verify_token = await this.signEmailVerifyToken({
      user_id: user_id.toString(),
      verify: userVerificationStatus.Unverified,
      role: 'user',
      tier
    })
    // Mã hóa mật khẩu
    const hashedPassword = await bcrypt.hash(payload.password, salt)

    const { confirm_password, ...userData } = payload

    const newUser = {
      _id: user_id,
      ...userData,
      ...defaultUserStructure,
      password: hashedPassword,
      tier
    } as IUser

    await databaseServices.users.insertOne(newUser)
    const { iat: iat_email_verify_token, exp: exp_email_verify_token } = await this.decodeEmailVerifyToken(
      email_verify_token
    )

    const [access_token, refresh_token] = await this.signAccessAndRefreshToken({
      user_id: user_id.toString(),
      verify: userVerificationStatus.Unverified,
      role: newUser.role,
      tier: newUser.tier
    })
    const { iat: iat_refresh_token, exp: exp_refresh_token } = await this.decodeRefreshToken(refresh_token)

    await databaseServices.tokens.insertOne(
      new Token({
        user_id,
        token: email_verify_token,
        type: tokenType.EmailVerificationToken,
        expires_at: new Date((exp_email_verify_token as number) * 1000),
        created_at: new Date((iat_email_verify_token as number) * 1000)
      })
    )
    await databaseServices.tokens.insertOne(
      new Token({
        user_id,
        token: refresh_token,
        type: tokenType.RefreshToken,
        expires_at: new Date((exp_refresh_token as number) * 1000),
        created_at: new Date((iat_refresh_token as number) * 1000)
      })
    )

    // Send verification email
    await emailService.sendVerificationEmail(payload.email, payload.username, email_verify_token)

    // Create user object for response without sensitive data
    const userResponse = {
      _id: user_id,
      username: newUser.username,
      email: newUser.email,
      avatar_url: newUser.avatar_url,
      tier: newUser.tier,
      verify: newUser.verify,
      role: newUser.role,
      permissions: newUser.permissions,
      subscription: newUser.subscription,
      created_at: newUser.created_at,
      update_at: newUser.updated_at
    }

    // Store user in Redis cache
    const redis = await redisClient;
    await redis.setObject(`user:${user_id.toString()}`, userResponse, 1800);

    return {
      access_token,
      refresh_token,
      user: userResponse
    }
  }

  async login(payload: LoginReqBody) {
    const { email, password } = payload

    const user = (await databaseServices.users.findOne({ email })) as {
      _id: { toString: () => string }
      password: string
      verify: userVerificationStatus
      role: string
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

    const [access_token, refresh_token] = await this.signAccessAndRefreshToken({
      user_id: user._id.toString(),
      verify: user.verify,
      role: user.role || 'user',
      tier: user.tier || 'free'
    })

    // câp nhật trạng thái và thời gian đăng nhập cuối cùng
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
    console.log('user', user)
    if (!user) {
      throw new ErrorWithStatus({
        status: HTTP_STATUS_CODES.UNAUTHORIZED,
        message: USER_MESSAGES.USER_NOT_FOUND
      })
    }

    // update last login time and status
    await databaseServices.users.updateOne(
      { _id: new ObjectId(user._id) },
      {
        $set: {
          last_login_time: new Date(),
          status: 'online'
        }
      }
    )

    const [access_token, refresh_token] = await this.signAccessAndRefreshToken({
      user_id: user._id.toString(),
      verify: userVerificationStatus.Verified,
      role: user.role || 'user',
      tier: user.tier || 'free'
    })

    await databaseServices.tokens.deleteMany({ user_id: user._id, type: tokenType.RefreshToken })

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

  async logout({ user_id, refresh_token }: { user_id: string; refresh_token: string }) {
    const redis = await redisClient;
    // Store refresh token in blacklist with proper expiry time
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
  }

  async refreshToken({
    user_id,
    role,
    verify,
    tier,
    refresh_token
  }: {
    user_id: string
    role: string
    verify: userVerificationStatus
    tier: string
    refresh_token: string
  }) {
    const user = (await databaseServices.users.findOne({ _id: new ObjectId(user_id) })) as IUser

    if (!user) {
      throw new ErrorWithStatus({
        status: HTTP_STATUS_CODES.NOT_FOUND,
        message: USER_MESSAGES.USER_NOT_FOUND
      })
    }

    // Update tier from database in case it has changed
    tier = user.tier || 'free'

    const token = await databaseServices.tokens.findOne({ user_id: new ObjectId(user_id), token: refresh_token })

    if (!token) {
      throw new ErrorWithStatus({
        status: HTTP_STATUS_CODES.UNAUTHORIZED,
        message: TOKEN_MESSAGES.TOKEN_NOT_FOUND
      })
    }

    const { iat: iat_refresh_token, exp: exp_refresh_token } = await this.decodeRefreshToken(refresh_token)

    if (exp_refresh_token < new Date().getTime() / 1000) {
      throw new ErrorWithStatus({
        status: HTTP_STATUS_CODES.UNAUTHORIZED,
        message: TOKEN_MESSAGES.TOKEN_EXPIRED
      })
    }

    // Blacklist old refresh token
    const redis = await redisClient;
    const expiryTime = typeof envConfig.refreshTokenExpiresIn === 'string'
      ? parseInt(envConfig.refreshTokenExpiresIn)
      : envConfig.refreshTokenExpiresIn;
    await redis.setObject(`bl_${refresh_token}`, { token: refresh_token }, expiryTime);

    const [access_token, new_refresh_token] = await this.signAccessAndRefreshToken({
      user_id: user_id,
      verify,
      role,
      tier
    })

    const { exp: new_exp_refresh_token } = await this.decodeRefreshToken(new_refresh_token)

    // Delete old refresh token from database
    await databaseServices.tokens.deleteOne({ _id: token._id })

    // Store new refresh token in database
    await databaseServices.tokens.insertOne(
      new Token({
        user_id: new ObjectId(user_id),
        token: new_refresh_token,
        type: tokenType.RefreshToken,
        expires_at: new Date((new_exp_refresh_token as number) * 1000),
        created_at: new Date((iat_refresh_token as number) * 1000)
      })
    )

    return {
      access_token,
      refresh_token: new_refresh_token
    }
  }

  async verifyEmail(email_verify_token: string) {
    // Verify the token
    const decode_email_verify_token = await this.decodeEmailVerifyToken(email_verify_token)
    const { user_id } = decode_email_verify_token

    // Find the user
    const user = (await databaseServices.users.findOne({ _id: new ObjectId(user_id) })) as IUser
    if (!user) {
      throw new ErrorWithStatus({
        status: HTTP_STATUS_CODES.NOT_FOUND,
        message: USER_MESSAGES.USER_NOT_FOUND
      })
    }

    // Check if user is already verified
    if (user.verify === userVerificationStatus.Verified) {
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
      throw new ErrorWithStatus({
        status: HTTP_STATUS_CODES.UNAUTHORIZED,
        message: TOKEN_MESSAGES.TOKEN_NOT_FOUND
      })
    }

    // Check if token is expired
    if (tokenInDB.expires_at.getTime() < new Date().getTime()) {
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
      role: user.role,
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
      throw new ErrorWithStatus({
        status: HTTP_STATUS_CODES.NOT_FOUND,
        message: USER_MESSAGES.USER_NOT_FOUND
      })
    }

    // Update user in Redis cache
    const redis = await redisClient;
    await redis.setObject(`user:${user_id}`, userResponse, 1800);

    return {
      access_token,
      refresh_token,
      user: userResponse
    }
  }

  async resendVerificationEmail(email: string) {
    // Find the user by email
    const user = (await databaseServices.users.findOne({ email })) as IUser

    if (!user) {
      throw new ErrorWithStatus({
        status: HTTP_STATUS_CODES.NOT_FOUND,
        message: USER_MESSAGES.EMAIL_NOT_EXIST
      })
    }

    // Check if user is already verified
    if (user.verify === userVerificationStatus.Verified) {
      throw new ErrorWithStatus({
        status: HTTP_STATUS_CODES.BAD_REQUEST,
        message: USER_MESSAGES.EMAIL_ALREADY_VERIFIED_BEFORE
      })
    }

    // Delete any existing verification tokens
    await databaseServices.tokens.deleteMany({
      user_id: user._id,
      type: tokenType.EmailVerificationToken
    })

    // Generate a new verification token
    const email_verify_token = await this.signEmailVerifyToken({
      user_id: user._id?.toString() || '',
      verify: userVerificationStatus.Unverified,
      role: user.role,
      tier: user.tier || 'free'
    })

    // Decode the token to get expiration time
    const { iat, exp } = await this.decodeEmailVerifyToken(email_verify_token)

    // Save the new token
    await databaseServices.tokens.insertOne(
      new Token({
        user_id: user._id,
        token: email_verify_token,
        type: tokenType.EmailVerificationToken,
        expires_at: new Date((exp as number) * 1000),
        created_at: new Date((iat as number) * 1000)
      })
    )

    // Send the verification email
    await emailService.sendVerificationEmail(user.email, user.username, email_verify_token)

    return { message: USER_MESSAGES.RESEND_VERIFY_EMAIL_SUCCESSFULLY }
  }
}
const authService = new AuthService()
export default authService
