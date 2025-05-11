import { JwtPayload } from "jsonwebtoken"
import { tokenType, userVerificationStatus } from "~/constants/enums"

export interface RegisterReqBody {
    username: string
    email: string
    password: string
    confirm_password: string
    date_of_birth: Date
    avatar_url?: string
}
export interface LoginReqBody {
    email: string
    password: string
}

export interface TokenPayload extends JwtPayload {
    user_id: string
    token_type: tokenType
    verify: userVerificationStatus
    tier: string
    exp: number
}

