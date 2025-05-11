import { USER_MESSAGES } from '~/constants/messages'
import { checkSchema, ParamSchema } from 'express-validator'
import { NAME_REGEXP } from '~/helpers/regex'
import { validate } from '~/utils/validation.utils'
import usersService from '~/services/user.service'
import { ErrorWithStatus } from '~/utils/error.utils'
import HTTP_STATUS_CODES_CODES from '~/core/statusCodes'
import { envConfig } from '~/constants/config'
import { verifyToken } from '~/utils/token.utils'
import { JsonWebTokenError } from 'jsonwebtoken'
import HTTP_STATUS_CODES from '~/core/statusCodes'
import databaseServices from '~/services/database.service'
import { tokenType } from '~/constants/enums'
import redisClient from '~/config/redis';

const usernameSchema: ParamSchema = {
  notEmpty: {
    errorMessage: USER_MESSAGES.NAME_REQUIRED
  },
  isString: {
    errorMessage: USER_MESSAGES.NAME_MUST_BE_STRING
  },
  isLength: {
    options: {
      min: 1,
      max: 100
    },
    errorMessage: USER_MESSAGES.NAME_LENGTH
  },
  trim: true,
  custom: {
    options: async (value: string) => {
      if (!NAME_REGEXP.test(value)) {
        throw new Error(USER_MESSAGES.USERNAME_INVALID)
      }
    }
  }
}

const dateOfBirthSchema: ParamSchema = {
  isISO8601: {
    options: {
      strict: true,
      strictSeparator: true
    }
  },
  custom: {
    options: async (value: string) => {  // Change type to string since that's what we'll receive
      const dateValue = new Date(value);  // Convert string to Date object
      const today = new Date();
      let age = today.getFullYear() - dateValue.getFullYear();
      const monthDiff = today.getMonth() - dateValue.getMonth();

      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dateValue.getDate())) {
        age--;
      }

      if (age > 120) {
        throw new ErrorWithStatus({
          message: 'Invalid date of birth: Age cannot be more than 120 years',
          status: HTTP_STATUS_CODES.BAD_REQUEST
        });
      }

      return true
    }
  }
}

const avatarURLSchema: ParamSchema = {
  optional: true,
  isString: {
    errorMessage: 'Avatar URL must be a string'
  },
  isLength: {
    options: {
      min: 0,
      max: 2000
    },
    errorMessage: 'Avatar URL length must be between 0 and 2000 characters'
  },
  trim: true,
  custom: {
    options: (value) => {
      if (value === '') {
        return true;
      }

      if (value) {
        try {
          new URL(value);
          return true;
        } catch (err) {
          throw new Error('Avatar URL must be a valid URL');
        }
      }
      return true;
    }
  }
}

const passwordShema: ParamSchema = {
  isString: {
    errorMessage: USER_MESSAGES.PASSWORD_MUST_BE_STRING
  },
  notEmpty: {
    errorMessage: USER_MESSAGES.PASSWORD_REQUIRED
  },
  isLength: {
    options: {
      min: 6,
      max: 50
    },
    errorMessage: USER_MESSAGES.PASSWORD_LENGTH
  },
  trim: true,
  isStrongPassword: {
    options: {
      minLength: 6,
      minLowercase: 1,
      minUppercase: 1,
      minNumbers: 1,
      minSymbols: 1,
      returnScore: false,
      pointsForContainingLower: 1,
      pointsForContainingUpper: 1,
      pointsForContainingNumber: 1,
      pointsForContainingSymbol: 1
    },
    errorMessage: USER_MESSAGES.PASSWORD_MUST_BE_STRONG
  }
}

const confirmPasswordSchema: ParamSchema = {
  isString: true,
  notEmpty: {
    errorMessage: USER_MESSAGES.CONFIRM_PASSWORD_REQUIRED
  },
  trim: true,
  custom: {
    options: (value, { req }) => {
      if (value !== req.body.password) {
        throw new Error(USER_MESSAGES.CONFIRM_PASSWORD_MUST_MATCH)
      }
      return value
    }
  }
}

export const registerValidation = validate(
  checkSchema(
    {
      username: usernameSchema,
      email: {
        notEmpty: {
          errorMessage: USER_MESSAGES.EMAIL_REQUIRED
        },
        trim: true,
        isEmail: {
          errorMessage: USER_MESSAGES.EMAIL_INVALID
        },
        custom: {
          options: async (value) => {
            const isEmailExist = await usersService.checkEmailExist(value)
            if (isEmailExist) {
              throw new Error(USER_MESSAGES.EMAIL_ALREADY_EXIST)
            }
            return !isEmailExist
          }
        }
      },
      password: passwordShema,
      confirm_password: confirmPasswordSchema,
      date_of_birth: dateOfBirthSchema,
      avatar_url: avatarURLSchema
    },
    ['body']
  )
)

export const loginValidation = validate(
  checkSchema(
    {
      email: {
        trim: true,
        notEmpty: {
          errorMessage: USER_MESSAGES.EMAIL_REQUIRED
        },
        isEmail: {
          errorMessage: USER_MESSAGES.EMAIL_INVALID
        }
      },
      password: passwordShema
    },
    ['body']
  )
)

export const accessTokenValidation = validate(
  checkSchema(
    {
      authorization: {
        custom: {
          options: async (value: string, { req }) => {
            let access_token: string | undefined = undefined

            if (value) {
              access_token = (value || '').split(' ')[1]
            } else if (req.cookies && req.cookies.jwt) {
              access_token = req.cookies.jwt
            }

            if (!access_token) {
              throw new ErrorWithStatus({
                message: USER_MESSAGES.ACCESS_TOKEN_REQUIRED,
                status: HTTP_STATUS_CODES_CODES.UNAUTHORIZED
              })
            }

            try {
              const decoded_authorization = await verifyToken({
                token: access_token,
                secretOrPublickey: envConfig.jwtSecretAccessToken
              })

              req.decoded_authorization = decoded_authorization
            } catch (error) {
              throw new ErrorWithStatus({
                message: (error as JsonWebTokenError).message,
                status: HTTP_STATUS_CODES_CODES.UNAUTHORIZED
              })
            }
            return true
          }
        }
      }
    },
    ['headers']
  )
)

export const refreshTokenValidation = validate(
  checkSchema(
    {
      refresh_token: {
        trim: true,
        custom: {
          options: async (value: string, { req }) => {
            let refresh_token: string | undefined

            if (value) {
              refresh_token = value
            } else if (req.cookies && req.cookies.jwt) {
              refresh_token = req.cookies.jwt
            }

            if (!refresh_token) {
              throw new ErrorWithStatus({
                message: USER_MESSAGES.REFRESH_TOKEN_REQUIRED,
                status: HTTP_STATUS_CODES.UNAUTHORIZED
              })
            }
            try {
              // kiểm tra refresh token có hợp lệ không
              const refreshTokenExist = await databaseServices.tokens.findOne({
                token: value,
                type: tokenType.RefreshToken
              })

              if (!refreshTokenExist) {
                throw new ErrorWithStatus({
                  message: USER_MESSAGES.REFRESH_TOKEN_IS_INVALID,
                  status: HTTP_STATUS_CODES.UNAUTHORIZED
                })
              }

              const redis = await redisClient;
              const isBlacklisted = await redis.getObject(`bl_${refreshTokenExist}`);
              if (isBlacklisted) {
                throw new ErrorWithStatus({
                  message: 'Please log in again',
                  status: HTTP_STATUS_CODES.UNAUTHORIZED
                })
              }

              const decoded_refresh_token = await verifyToken({
                token: value,
                secretOrPublickey: envConfig.jwtSecretRefreshToken
              })

              req.decoded_refresh_token = decoded_refresh_token
            } catch (error) {
              throw new ErrorWithStatus({
                message: (error as JsonWebTokenError).message,
                status: HTTP_STATUS_CODES.UNAUTHORIZED
              })
            }
            return true
          }
        }
      }
    },
    ['body']
  )
)

