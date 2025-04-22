export enum userVerificationStatus {
    Unverified = 'unverified',
    Verified = 'verified',
    Expired = 'expired'
}

export enum tokenType {
    AccessToken = 'accessToken',
    RefreshToken = 'refreshToken',
    ForgotPasswordToken = 'forgotPasswordToken',
    EmailVerificationToken = 'emailVerificationToken'
}
