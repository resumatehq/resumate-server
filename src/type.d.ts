import { TokenPayload } from "./models/requests/user.request";
import { IUser } from "./models/schemas/user.schema";
declare global {
  namespace Express {
    interface Request {
      decoded_authorization?: TokenPayload,
      user?: IUser;
    }
  }
}
