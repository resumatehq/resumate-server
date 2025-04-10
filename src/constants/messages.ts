export const USER_MESSAGES = {
    VALIDATION_ERROR: "Validation error",
    NAME_REQUIRED: "Name is required",
    NAME_MUST_BE_STRING: "Name must be a string",
    NAME_LENGTH: "Name must be between 1 and 100 characters long",
    USERNAME_INVALID: "Username is invalid",
    EMAIL_ALREADY_EXIST: "Email is already exist",
    EMAIL_REQUIRED: "Email is required",
    EMAIL_INVALID: "Email is invalid",
    PASSWORD_REQUIRED: "Password is required",
    PASSWORD_MUST_BE_STRING: "Password must be a string",
    PASSWORD_LENGTH: "Password must be at least 6 characters long",
    PASSWORD_MUST_BE_STRONG:
        " Password must be at least 6 characters long, contain at least one uppercase letter, one lowercase letter, one number and one symbol",
    CONFIRM_PASSWORD_REQUIRED: "Confirm password is required",
    CONFIRM_PASSWORD_MUST_BE_MATCH: "Confirm password must match with password",
    EMAIL_OR_PASSWORD_IS_INCORRECT: "Email or password is incorrect",
    LOGIN_SUCCESSFULLY: "Login successfully",
    REGISTER_SUCCESSFULLY: "Register successfully",
    REGISTER_FAILED: "Register failed",
    LOGOUT_FAILED: "Logout failed",
    INVALID_USER: "Invalid user",
    // verify email
    USER_NOT_VERIFIED: "User not verified",
    EMAIL_ALREADY_VERIFIED_BEFORE: "Email already verified before",
    RESEND_VERIFY_EMAIL_SUCCESSFULLY: "Resend verify email successfully",
    //accessToken
    ACCESS_TOKEN_REQUIRED: "Access token is required",
    ACCESS_TOKEN_IS_INVALID: "Access token is invalid",
    //refreshToken
    REFRESH_TOKEN_REQUIRED: "Refresh token is required",
    REFRESH_TOKEN_MUST_BE_STRING: "Refresh token must be a string",
    REFRESH_TOKEN_IS_INVALID: "Refresh token is invalid",
    REFRESH_TOKEN_SUCCESSFULLY: "Refresh token successfully",
    REFRESH_TOKEN_NOT_FOUND: "Refresh token not found",
    REFRESH_TOKEN_EXPIRED: "Refresh token expired",
    //logout
    USED_REFRESH_TOKEN_OR_NOT_EXIST: "Used refresh token or not exist",
    LOGOUT_SUCCESSFULLY: "Logout successfully",
    //Email verification
    EMAIL_VERIFICATION_TOKEN_REQUIRED: "Email verification token is required",
    EMAIL_VERIFICATION_TOKEN_MUST_BE_STRING:
        "Email verification token must be a string",
    EMAIL_ALREADY_VERIFIED: "Email already verified",
    USER_NOT_FOUND: "User not found",
    EMAIL_VERIFIED_SUCCESSFULLY: "Email verified successfully",
    EMAIL_NOT_EXIST: "Email not exist. Please register",
    // Update me
    BIO_MUST_BE_STRING: "Bio must be a string",
    BIO_LENGTH: "Bio must be between 1 and 110 characters long",
    UPDATE_ME_SUCCESSFULLY: "Update me successfully",
    // Forgot password , reset password , verify forgot password , change password
    CHECK_EMAIL_TO_RESET_PASSWORD: "Check your email to reset password",
    FORGOT_PASSWORD_TOKEN_REQUIRED: "Forgot password token is required",
    FORGOT_PASSWORD_TOKEN_IS_INVALID: "Forgot password token is invalid",
    VERIFY_FORGOT_PASSWORD_SUCCESSFULLY: "Verify forgot password successfully",
    RESET_PASSWORD_SUCCESSFULLY: "Reset password successfully",
    OLD_PASSWORD_INCORRECT: "Old password is incorrect",
    CHANGE_PASSWORD_SUCCESSFULLY: "Change password successfully",
    // get me
    GET_ME_SUCCESSFULLY: "Get me successfully",
    // get user
    GET_USER_SUCCESSFULLY: "Get user successfully",
    SEARCH_USER_SUCCESSFULLY: "Search user successfully",
} as const;

export const TOKEN_MESSAGES = {
    TOKEN_REQUIRED: "Token is required",
    TOKEN_NOT_FOUND: "Token not found",
    TOKEN_EXPIRED: "Token expired",
    TOKEN_INVALID: "Token is invalid",
} as const;