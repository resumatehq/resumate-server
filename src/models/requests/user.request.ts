import { JwtPayload } from "jsonwebtoken"
import { tokenType, userVerificationStatus } from "~/constants/enums"

export interface RegisterReqBody {
    username: string
    email: string
    password: string
    date_of_birth: Date
    status?: string
    created_at?: Date
    updated_at?: Date
    last_login_time?: Date
}
export interface LoginReqBody {
    email: string
    password: string
}

export interface TokenPayload extends JwtPayload {
    user_id: string
    token_type: tokenType
    verify: userVerificationStatus
    exp: number
}

