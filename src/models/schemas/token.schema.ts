import { Schema, model, Document, Types } from 'mongoose'
import { IUser } from './user.schema'
import { envConfig } from '~/constants/config'

const TokenSchema = new Schema({
    user_id: {
        type: Types.ObjectId,
        ref: envConfig.dbTokenCollection,
        required: true
    },
    token: {
        type: String,
        required: true
    },
    type: {
        type: String,
        required: true
    },
    expires_at: {
        type: Date,
        required: true
    },
    created_at: {
        type: Date,
        default: Date.now
    }
})

export interface IToken extends Document {
    user_id: IUser['_id']
    token: string
    type: string // Loại token (vd: 'reset-password', 'verify-email', )
    expires_at: Date
    created_at: Date
}

export const Token = model<IToken>(envConfig.dbTokenCollection, TokenSchema)
