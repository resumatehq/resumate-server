import { TokenPayload } from '~/models/requests/user.requests'
declare global {
  namespace Express {
    interface Request {
      decoded_authorization?: TokenPayload
    }
  }
}
