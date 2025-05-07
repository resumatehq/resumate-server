import { ErrorWithStatus } from "~/utils/error.utils";
import databaseServices from "./database.service";
import { ObjectId } from "mongodb";
import { USER_MESSAGES } from "~/constants/messages";
import HTTP_STATUS_CODES from "~/core/statusCodes";
import redisClient from "~/config/redis";
import { IUser, IUserPermissions, UserTier } from "~/models/schemas/user.schema";

class UsersService {
  async findById(id: string) {
    return await databaseServices.users.findOne({ _id: new Object(id) })
  }

  async checkEmailExist(email: string) {
    const user = await databaseServices.users.findOne({ email });
    return !!user;
  }

  async getUserById(id: string) {
    const redis = await redisClient;

    const cachedUser = await redis.getObject(`user:${id}`);
    if (cachedUser) {
      const { password, ...userWithoutPassword } = cachedUser as any;
      return userWithoutPassword;
    }

    // Fallback to database
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

    // Cache user for future requests (expire after 30 minutes)
    await redis.setObject(`user:${id}`, user, 1800);

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

    // Initialize Redis client
    const redis = await redisClient;

    // Check if search result is cached
    const cacheKey = `user:search:${sanitizedQuery}`;
    const cachedResults = await redis.getObject(cacheKey);
    if (cachedResults) return cachedResults;

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
            created_at: 1,
          }
        }
      ])
      .toArray();

    const users = result.map(user => ({
      _id: user._id,
      username: user.username,
      email: user.email,
      avatar_url: user.avatar_url,
      status: user.status,
      verify: user.verify,
      created_at: user.created_at,
      accountType: user.accountType
    }));

    // Cache the search results for 10 minutes
    await redis.setObject(cacheKey, users, 10 * 60);

    return users;
  }

  async updateProfile(userId: string, updates: {
    username?: string,
    avatar_url?: string,
    date_of_birth?: Date,
    bio?: string,
    industry?: string,
    experience?: string,
    location?: string,
    phone?: string,
    social_links?: {
      linkedin?: string;
      github?: string;
      twitter?: string;
      website?: string;
    }
  }) {
    // Remove any undefined fields
    const filteredUpdates = Object.fromEntries(
      Object.entries(updates).filter(([_, value]) => value !== undefined)
    );

    // If no valid updates, throw error
    if (Object.keys(filteredUpdates).length === 0) {
      throw new ErrorWithStatus({
        message: 'No valid fields provided for update',
        status: HTTP_STATUS_CODES.BAD_REQUEST
      });
    }

    // Handle social_links update properly
    if (filteredUpdates.social_links) {
      // If user wants to update social links, we need to do a partial update
      // to avoid overwriting existing links that are not being updated
      const user = await databaseServices.users.findOne(
        { _id: new ObjectId(userId) },
        { projection: { social_links: 1 } }
      );

      if (user && user.social_links) {
        // Merge existing social links with updated ones
        const existingSocialLinks = user.social_links || {};
        const updatedSocialLinks = filteredUpdates.social_links || {};

        filteredUpdates.social_links = Object.assign({}, existingSocialLinks, updatedSocialLinks);
      }
    }

    // Add updated_at timestamp
    filteredUpdates.updated_at = new Date();

    const result = await databaseServices.users.findOneAndUpdate(
      { _id: new ObjectId(userId) },
      { $set: filteredUpdates },
      {
        returnDocument: 'after',
        projection: {
          password: 0,
          forgot_password: 0,
        }
      }
    );

    if (!result) {
      throw new ErrorWithStatus({
        message: USER_MESSAGES.USER_NOT_FOUND,
        status: HTTP_STATUS_CODES.NOT_FOUND,
      });
    }

    // Initialize Redis client
    const redis = await redisClient;

    // Invalidate user cache
    await redis.del(`user:${userId}`);

    return result;
  }

  updatePermissions(user: IUser): { tier: UserTier, permissions: IUserPermissions } {
    const status = user.subscription.status;
    const plan = user.subscription.plan;
    let permissions = user.permissions;

    // Set permissions based on plan
    if (plan === 'free') {
      permissions = {
        maxResumes: 3,
        maxCustomSections: 0,
        // allowedSections: ['personal', 'education', 'experience', 'skills', 'summary'],
        allowedFeatures: ['basic_editor', 'basic_ai'],
        allowedExportFormats: ['pdf'],
        aiRequests: {
          maxPerDay: 10,
          maxPerMonth: 100,
          usedToday: permissions?.aiRequests?.usedToday || 0,
          usedThisMonth: permissions?.aiRequests?.usedThisMonth || 0,
          lastResetDay: permissions?.aiRequests?.lastResetDay,
          lastResetMonth: permissions?.aiRequests?.lastResetMonth
        }
      };
    } else if (plan === 'premium_monthly' || plan === 'premium_yearly') {
      permissions = {
        maxResumes: plan === 'premium_yearly' ? 20 : 10,
        maxCustomSections: 5,
        // allowedSections: [
        //   'personal', 'education', 'experience', 'skills', 'summary',
        //   'projects', 'certifications', 'languages', 'interests',
        //   'awards', 'publications', 'references', 'custom'
        // ],
        allowedFeatures: [
          'basic_editor', 'advanced_editor',
          'basic_ai', 'advanced_ai',
          'analytics', 'priority_support'
        ],
        allowedExportFormats: ['pdf', 'docx', 'png', 'json'],
        aiRequests: {
          maxPerDay: plan === 'premium_yearly' ? 100 : 50,
          maxPerMonth: plan === 'premium_yearly' ? 1000 : 500,
          usedToday: permissions?.aiRequests?.usedToday || 0,
          usedThisMonth: permissions?.aiRequests?.usedThisMonth || 0,
          lastResetDay: permissions?.aiRequests?.lastResetDay,
          lastResetMonth: permissions?.aiRequests?.lastResetMonth
        }
      };
    }

    // Update tier based on subscription
    const tier = (plan !== 'free' && status === 'active') ? 'premium' : 'free';

    return { tier, permissions };
  }

  async incrementUsageCounter(userId: string, counter: 'createdResumes' | 'aiRequestsCount' | 'exportsCount.pdf' | 'exportsCount.docx' | 'exportsCount.png') {
    const updateObj: any = {};
    updateObj[`usage.${counter}`] = 1;

    const result = await databaseServices.users.updateOne(
      { _id: new ObjectId(userId) },
      { $inc: updateObj, $set: { "usage.lastResumeCreatedAt": counter === 'createdResumes' ? new Date() : undefined } }
    );

    if (result.matchedCount === 0) {
      throw new ErrorWithStatus({
        message: USER_MESSAGES.USER_NOT_FOUND,
        status: HTTP_STATUS_CODES.NOT_FOUND,
      });
    }

    const redis = await redisClient;
    await redis.del(`user:${userId}`);

    return { success: true };
  }
}

const usersService = new UsersService();
export default usersService;
