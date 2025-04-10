import { ErrorWithStatus } from "~/utils/error.utils";
import databaseServices from "./database.service";
import { ObjectId } from "mongodb";
import { USER_MESSAGES } from "~/constants/messages";
import HTTP_STATUS_CODES from "~/core/statusCodes";
class UsersService {
  async checkEmailExist(email: string) {
    const user = await databaseServices.users.findOne({ email });
    return !!user;
  }

  async checkUserExistById(id: string) {
    const user = await databaseServices.users.findOne({
      _id: new ObjectId(id),
    });
    return !!user;
  }

  async getUserById(id: string) {
    const user = await databaseServices.users.findOne(
      {
        _id: new ObjectId(id)
      },
      {
        projection: {
          password: 0,
          forgot_password_token: 0,
          email_verify_token: 0,
          forgot_password: 0,
        }
      }
    );

    if (!user) {
      throw new ErrorWithStatus({
        message: USER_MESSAGES.USER_NOT_FOUND,
        status: HTTP_STATUS_CODES.NOT_FOUND,
      });
    }

    return user;
  }

  async searchUserByEmail(query: string) {
    // Sanitize and validate query
    const sanitizedQuery = query.trim().toLowerCase();

    if (sanitizedQuery.length < 3) {
      throw new ErrorWithStatus({
        message: 'Search query must be at least 3 characters long',
        status: HTTP_STATUS_CODES.BAD_REQUEST
      });
    }

    const result = await databaseServices.users
      .aggregate([
        {
          $search: {
            index: 'email_index',
            compound: {
              must: [
                {
                  text: {
                    query: sanitizedQuery,
                    path: "email",
                    fuzzy: {
                      maxEdits: 1,
                      prefixLength: 3
                    }
                  }
                }
              ]
            }
          }
        },
        {
          $match: {
            email: new RegExp('^' + sanitizedQuery, 'i')
          }
        },
        {
          $limit: 5
        },
        {
          $project: {
            _id: 1,
            username: 1,
            email: 1,
            avatar_url: 1,
            status: 1,
            verify: 1,
            created_at: 1
          }
        }
      ])
      .toArray();

    // Don't throw error if no results found, just return empty array
    return result.map(user => ({
      _id: user._id,
      username: user.username,
      email: user.email,
      avatar_url: user.avatar_url,
      status: user.status,
      verify: user.verify,
      created_at: user.created_at
    }));
  }

}

const usersService = new UsersService();
export default usersService;
