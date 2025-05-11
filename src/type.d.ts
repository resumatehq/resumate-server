import { TokenPayload } from "./models/requests/user.request";
import { IResume } from "./models/schemas/resume.schema";
import { IUser } from "./models/schemas/user.schema";
declare global {
  namespace Express {
    interface Request {
      decoded_authorization?: TokenPayload,
      user?: IUser;
      resume?: IResume
      file_url?: string;
      file_urls?: string[];
    }
  }
}
