import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { envConfig } from "~/constants/config";
import databaseServices from "~/services/database.service";
import { ObjectId } from "mongodb";
import { IUser, defaultUserStructure } from "~/models/schemas/user.schema";
import { userVerificationStatus } from "~/constants/enums";
import { logger } from "~/loggers/my-logger.log";

passport.use(
    new GoogleStrategy(
        {
            clientID: envConfig.googleClientId,
            clientSecret: envConfig.googleClientSecret,
            callbackURL:
                envConfig.nodeEnv === "development"
                    ? envConfig.googleCallbackURLDev
                    : envConfig.googleCallbackURLProd,
            scope: ["profile", "email"],
            passReqToCallback: true,
        },
        async (req, accessToken, refreshToken, profile, done) => {
            try {
                logger.info(`Google auth attempt for profile ID ${profile.id}`, "passport.googleStrategy");

                // First check if user exists with Google ID
                const existingUserByGoogleId = await databaseServices.users.findOne({ googleId: profile.id });
                if (existingUserByGoogleId) {
                    logger.info(`User found with Google ID: ${profile.id}`, "passport.googleStrategy");
                    return done(null, existingUserByGoogleId);
                }

                // Check if email is available
                const email = profile.emails?.[0]?.value;
                if (!email) {
                    logger.error("Email is required for Google authentication", "passport.googleStrategy");
                    return done(new Error('Email is required for authentication'), false);
                }

                // Check if user exists with that email
                const existingUserByEmail = await databaseServices.users.findOne({ email });

                if (existingUserByEmail) {
                    // Update existing user with Google ID
                    await databaseServices.users.updateOne(
                        { _id: existingUserByEmail._id },
                        {
                            $set: {
                                googleId: profile.id,
                                verify: userVerificationStatus.Verified, // Auto-verify users who sign in with Google
                                avatar_url: existingUserByEmail.avatar_url || profile.photos?.[0]?.value || '',
                                updated_at: new Date(),
                                last_login_time: new Date()
                            }
                        }
                    );

                    logger.info(`Updated existing user with Google ID: ${profile.id}`, "passport.googleStrategy");

                    // Get updated user
                    const updatedUser = await databaseServices.users.findOne({ _id: existingUserByEmail._id });

                    if (!updatedUser) {
                        logger.error(`Failed to find updated user: ${existingUserByEmail._id.toString()}`, "passport.googleStrategy");
                        return done(new Error('User update failed'), false);
                    }

                    return done(null, updatedUser);
                }

                // Create new user
                const userId = new ObjectId();
                const profileJson = profile._json as any;

                // Create user object with proper structure
                const newUser: Partial<IUser> = {
                    _id: userId,
                    googleId: profile.id,
                    email: email,
                    username: profile.displayName,
                    avatar_url: profile.photos?.[0]?.value || '',
                    date_of_birth: profileJson.birthday ? new Date(profileJson.birthday) : new Date(),
                    verify: userVerificationStatus.Verified, // Auto-verify for Google accounts
                    ...defaultUserStructure,
                    last_login_time: new Date(),
                };

                const result = await databaseServices.users.insertOne(newUser as IUser);
                logger.info(`Created new user from Google OAuth: ${userId.toString()}`, "passport.googleStrategy");

                const createdUser = await databaseServices.users.findOne({ _id: result.insertedId });

                if (!createdUser) {
                    logger.error(`Failed to find newly created user: ${userId.toString()}`, "passport.googleStrategy");
                    return done(new Error('User creation failed'), false);
                }

                return done(null, createdUser);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                logger.error(`Google authentication error: ${errorMessage}`, "passport.googleStrategy");
                return done(error, false);
            }
        }
    )
);

export default passport;
