import { TokenPayload } from "./models/requests/user.request";
declare global {
  namespace Express {
    interface Request {
      decoded_authorization?: TokenPayload
    }
  }
}
