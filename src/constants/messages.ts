export const USER_MESSAGES = {
    // Auth messages
    AUTH_REQUIRED: 'Authentication required',
    INVALID_CREDENTIALS: 'Invalid email or password',
    ACCOUNT_NOT_FOUND: 'Account not found',
    ACCOUNT_ALREADY_EXISTS: 'Account already exists',
    USER_NOT_FOUND: 'User not found',

    // Permissions & Access
    FEATURE_ACCESS_DENIED: 'You don\'t have permission to access this feature. Please upgrade your plan.',
    PREMIUM_REQUIRED: 'This feature requires a premium subscription',
    SUBSCRIPTION_EXPIRED: 'Your premium subscription has expired',

    // Validation messages
    VALIDATION_ERROR: 'Validation error',
    NAME_REQUIRED: 'Name is required',
    NAME_MUST_BE_STRING: 'Name must be a string',
    NAME_LENGTH: 'Name must be between 1 and 100 characters long',
    USERNAME_INVALID: "Username is invalid",
    EMAIL_ALREADY_EXIST: "Email is already exist",
    EMAIL_REQUIRED: 'Email is required',
    EMAIL_MUST_BE_STRING: 'Email must be a string',
    EMAIL_INVALID: 'Invalid email format',
    PASSWORD_REQUIRED: 'Password is required',
    PASSWORD_MUST_BE_STRING: 'Password must be a string',
    PASSWORD_LENGTH: 'Password must be between 6 and 50 characters long',
    PASSWORD_WEAK: 'Password is too weak',
    CONFIRM_PASSWORD_MUST_MATCH: 'Confirm password must match password',
    CONFIRM_PASSWORD_REQUIRED: "Confirm password is required",
    PASSWORD_MUST_BE_STRONG: "Password must be strong",
    EMAIL_OR_PASSWORD_IS_INCORRECT: "Email of password is incorrect",
    // Resume related messages
    RESUME_CREATE_SUCCESS: 'Resume created successfully',
    RESUME_UPDATE_SUCCESS: 'Resume updated successfully',
    RESUME_DELETE_SUCCESS: 'Resume deleted successfully',
    RESUME_NOT_FOUND: 'Resume not found',
    RESUME_REQUESTS_LIMIT_EXCEEDED: 'Resume creation limit exceeded',

    // Template related messages
    TEMPLATE_NOT_FOUND: 'Template not found',
    TEMPLATE_NOT_AVAILABLE: 'This template is not available for your current plan',

    // AI related messages
    AI_REQUESTS_LIMIT_EXCEEDED: 'AI request limit exceeded',

    // Export related messages
    EXPORT_FORMAT_NOT_SUPPORTED: 'Export format not supported for your current plan',
    EXPORT_REQUESTS_LIMIT_EXCEEDED: 'Export request limit exceeded',

    // Login and Register
    LOGIN_SUCCESSFULLY: "Login successfully",
    REGISTER_SUCCESSFULLY: "Register successfully",
    REGISTER_FAILED: "Register failed",
    LOGOUT_FAILED: "Logout failed",
    INVALID_USER: "Invalid user",
    USER_NO_LONGER_EXISTS: "User no longer exists",
    // verify email
    USER_NOT_VERIFIED: "User not verified",
    EMAIL_ALREADY_VERIFIED_BEFORE: "Email already verified before",
    RESEND_VERIFY_EMAIL_SUCCESSFULLY: "Resend verify email successfully",
    EMAIL_VERIFIED_SUCCESSFULLY: "Email verified successfully",
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
    RATE_LIMIT_EXCEEDED: 'Rate limit exceeded. Please try again later',
} as const;

export const TOKEN_MESSAGES = {
    TOKEN_REQUIRED: "Token is required",
    TOKEN_NOT_FOUND: "Token not found",
    TOKEN_EXPIRED: "Token expired",
    TOKEN_INVALID: "Token is invalid",
    TOKEN_BLACKLIST_FAILED: "Failed to blacklist token",
    TOKEN_CREATION_FAILED: "Failed to create new token",
} as const;


export const API_KEY_MESSAGES = {
    API_KEY_REQUIRED: "API key is required",
    API_KEY_NOT_FOUND: "API key not found",
    API_KEY_INVALID: "API key is invalid",
    API_KEY_EXPIRED: "API key expired",
    API_KEY_VALIDATION_REQUIRED: "API key validation required",
    API_KEY_PERMISSION_DENIED: "API key does not have permission for this action",
    API_KEY_SUCCESSFULLY: "API key successfully",
    API_KEY_CREATED_SUCCESSFULLY: "API key created successfully",
    API_KEY_DELETED_SUCCESSFULLY: "API key deleted successfully",
    API_KEY_UPDATED_SUCCESSFULLY: "API key updated successfully",
    API_KEY_IP_RESTRICTED: "API key not authorized for this IP address",
} as const;

export const IP_MESSAGES = {
    IP_NOT_ALLOWED: "Ip not allowed"
} as const