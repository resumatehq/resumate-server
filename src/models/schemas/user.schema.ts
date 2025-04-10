import { Schema, model, Document, Types } from 'mongoose'
import { envConfig } from '~/constants/config';
import { EMAIL_REGEXP, NAME_REGEXP } from '~/helpers/regex'

const UserSchema = new Schema({
    username: {
        type: String,
        trim: true,
        unique: true,
        match: NAME_REGEXP,
        required: true,
        index: true
    },
    email: {
        type: String,
        trim: true,
        unique: true,
        required: true,
        match: EMAIL_REGEXP,
        index: true
    },
    password: {
        type: String,
        required: function (this: any) {
            return !this.googleId;
        }
    },
    googleId: {
        type: String,
        unique: true,
        sparse: true
    },
    date_of_birth: { type: Date, default: Date.now },
    avatar_url: {
        type: String,
        default: ''
    },
    status: {
        type: String,
        enum: ['online', 'offline'],
        default: 'offline'
    },
    forgot_password: {
        type: String,
        default: ''
    },
    verify: {
        type: String,
        enum: ["unverified", "verified", "expired"],
        default: "unverified"
    },
    role: {
        type: String,
        enum: ['admin', 'user'],
        default: 'user',
    },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
    last_login_time: { type: Date, default: Date.now }
})

export interface IUser extends Document {
    _id: Types.ObjectId
    username: string
    email: string
    password?: string // Mật khẩu không bắt buộc nếu đăng nhập bằng Google
    googleId?: string // ID từ Google
    date_of_birth: Date
    avatar_url?: string
    bio: string
    status: string
    tag: string
    forgot_password: string
    verify: string
    role: string
    created_at: Date
    updated_at: Date
    last_login_time: Date
}

const User = model<IUser>(envConfig.dbUserCollection, UserSchema)

export default User
