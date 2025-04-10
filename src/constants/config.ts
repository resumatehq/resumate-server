import { config } from 'dotenv'
import argv from 'minimist'
import type { StringValue } from 'ms'

const options = argv(process.argv.slice(2))

// export const isProduction = options.env === 'production'

config({
  path: options.env ? `.env.${options.env}` : '.env'
})

export const envConfig = {
  // Server Configuration
  host: process.env.HOST as string,
  port: (process.env.PORT as string) || 8000,
  clientUrl: process.env.CLIENT_URL as string,

  // Database Connection
  dbUsername: process.env.DB_USERNAME as string,
  dbPassword: process.env.DB_PASSWORD as string,
  dbName: process.env.DB_NAME as string,
  appName: process.env.APP_NAME as string,

  // Encription
  encryptionKey: process.env.ENCRYPTION_KEY as string,

  // Authentication
  jwtSecretAccessToken: process.env.JWT_SECRET_ACCESS_TOKEN as string,
  jwtSecretRefreshToken: process.env.JWT_SECRET_REFRESH_TOKEN as string,
  accessTokenExpiresIn: process.env.JWT_EXPIRES_IN_ACCESS_TOKEN as number | StringValue,
  refreshTokenExpiresIn: process.env.JWT_EXPIRES_IN_REFRESH_TOKEN as number | StringValue,
  jwtSecretEmailVerifyToken: process.env.JWT_SECRET_EMAIL_VERIFY_TOKEN as string | StringValue,
  emailVerifyTokenExpiresIn: process.env.JWT_EXPIRES_IN_EMAIL_VERIFY_TOKEN as number | StringValue,

  // SMTP Configuration
  smtpHost: process.env.SMTP_HOST as string,
  smtpPort: parseInt(process.env.SMTP_PORT as string) || 587,
  smtpSecure: process.env.SMTP_SECURE === 'true',
  smtpUser: process.env.SMTP_USER as string,
  smtpPassword: process.env.SMTP_PASSWORD as string,

  // google oauth20
  googleClientId: process.env.GOOGLE_CLIENT_ID as string,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
  googleCallbackURLDev: process.env.GOOGLE_CALLBACK_URL_DEV as string,
  googleCallbackURLProd: process.env.GOOGLE_CALLBACK_URL_PROD as string,
  googleRedirectClientUrl: process.env.GOOGLE_REDIRECT_CLIENT_URL as string,

  // User Collections
  dbUserCollection: process.env.DB_USER_COLLECTION as string,
  dbAdminCollection: process.env.DB_ADMIN_COLLECTION as string,
  dbTokenCollection: process.env.DB_TOKEN_COLLECTION as string,
} as const
