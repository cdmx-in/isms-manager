import { PassportStatic } from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import { Strategy as GoogleStrategy, Profile } from 'passport-google-oauth20';
import bcrypt from 'bcryptjs';
import { prisma } from '../index.js';
import { logger } from '../utils/logger.js';

export const configurePassport = (passport: PassportStatic) => {
  // Local Strategy (email/password)
  passport.use(
    'local',
    new LocalStrategy(
      {
        usernameField: 'email',
        passwordField: 'password',
        passReqToCallback: true,
      },
      async (req, email, password, done) => {
        try {
          const user = await prisma.user.findUnique({
            where: { email: email.toLowerCase() },
            include: {
              organizationMemberships: {
                include: {
                  organization: true,
                  orgRole: {
                    select: { id: true, name: true, permissions: true },
                  },
                },
              },
            },
          });

          if (!user) {
            return done(null, false, { message: 'Invalid email or password' });
          }

          if (!user.isActive) {
            return done(null, false, { message: 'Account is deactivated' });
          }

          // Check lockout
          if (user.lockoutUntil && user.lockoutUntil > new Date()) {
            const remainingMinutes = Math.ceil(
              (user.lockoutUntil.getTime() - Date.now()) / 60000
            );
            return done(null, false, {
              message: `Account locked. Try again in ${remainingMinutes} minutes`,
            });
          }

          // Check password
          if (!user.passwordHash) {
            return done(null, false, { message: 'Invalid email or password' });
          }

          const isValidPassword = await bcrypt.compare(password, user.passwordHash);

          if (!isValidPassword) {
            // Increment failed attempts
            const failedAttempts = user.failedLoginAttempts + 1;
            const lockoutUntil = failedAttempts >= 5
              ? new Date(Date.now() + 15 * 60 * 1000) // 15 min lockout
              : null;

            await prisma.user.update({
              where: { id: user.id },
              data: {
                failedLoginAttempts: failedAttempts,
                lockoutUntil,
              },
            });

            return done(null, false, { message: 'Invalid email or password' });
          }

          // Reset failed attempts on successful login
          await prisma.user.update({
            where: { id: user.id },
            data: {
              failedLoginAttempts: 0,
              lockoutUntil: null,
              lastLoginAt: new Date(),
            },
          });

          return done(null, user);
        } catch (error) {
          logger.error('Local Strategy error:', error);
          return done(error, false);
        }
      }
    )
  );

  // Google OAuth Strategy
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    const googleStrategy = new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL || '/api/auth/google/callback',
        scope: ['profile', 'email', 'https://www.googleapis.com/auth/drive.readonly'],
        accessType: 'offline',
        prompt: 'consent',
        tokenURL: 'https://oauth2.googleapis.com/token',
      } as any,
      async (accessToken, refreshToken, profile: Profile, done) => {
        try {
          const email = profile.emails?.[0]?.value;
          if (!email) {
            return done(null, false, { message: 'No email provided by Google' });
          }

          // Google Drive token data
          const driveTokenData = {
            googleDriveAccessToken: accessToken || null,
            googleDriveRefreshToken: refreshToken || null,
            googleDriveTokenExpiry: new Date(Date.now() + 3600 * 1000), // ~1 hour
          };

          // Find or create user
          let user = await prisma.user.findUnique({
            where: { email: email.toLowerCase() },
            include: {
              organizationMemberships: {
                include: {
                  organization: true,
                  orgRole: {
                    select: { id: true, name: true, permissions: true },
                  },
                },
              },
            },
          });

          if (user) {
            // Update existing user with Google info and Drive tokens
            const updateData: any = {
              lastLoginAt: new Date(),
              ...driveTokenData,
            };
            if (user.authProvider !== 'GOOGLE') {
              updateData.authProvider = 'GOOGLE';
              updateData.authProviderId = profile.id;
              updateData.isEmailVerified = true;
              updateData.avatar = profile.photos?.[0]?.value || user.avatar;
            }
            user = await prisma.user.update({
              where: { id: user.id },
              data: updateData,
              include: {
                organizationMemberships: {
                  include: {
                    organization: true,
                    orgRole: {
                      select: { id: true, name: true, permissions: true },
                    },
                  },
                },
              },
            });
          } else {
            // Create new user
            user = await prisma.user.create({
              data: {
                email: email.toLowerCase(),
                firstName: profile.name?.givenName || 'User',
                lastName: profile.name?.familyName || '',
                authProvider: 'GOOGLE',
                authProviderId: profile.id,
                isEmailVerified: true,
                avatar: profile.photos?.[0]?.value,
                lastLoginAt: new Date(),
                ...driveTokenData,
              },
              include: {
                organizationMemberships: {
                  include: {
                    organization: true,
                    orgRole: {
                      select: { id: true, name: true, permissions: true },
                    },
                  },
                },
              },
            });
          }

          if (!user.isActive) {
            return done(null, false, { message: 'Account is deactivated' });
          }

          return done(null, user);
        } catch (error) {
          logger.error('Google Strategy error:', error);
          return done(error as Error, false);
        }
      }
    );

    // Debug: log token exchange parameters
    const origGetOAuthAccessToken = (googleStrategy as any)._oauth2.getOAuthAccessToken.bind((googleStrategy as any)._oauth2);
    (googleStrategy as any)._oauth2.getOAuthAccessToken = (code: string, params: any, callback: any) => {
      logger.info('OAuth token exchange - code length: ' + code.length);
      logger.info('OAuth token exchange - redirect_uri: ' + params.redirect_uri);
      logger.info('OAuth token exchange - tokenURL: ' + (googleStrategy as any)._oauth2._accessTokenUrl);
      origGetOAuthAccessToken(code, params, (err: any, accessToken: string, refreshToken: string, results: any) => {
        if (err) {
          logger.error('OAuth token exchange failed:', JSON.stringify(err.data || err));
        }
        callback(err, accessToken, refreshToken, results);
      });
    };

    passport.use('google', googleStrategy);
  }

  // Serialize user for session
  passport.serializeUser((user: any, done) => {
    done(null, user.id);
  });

  // Deserialize user from session (includes orgRole for RBAC permissions)
  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id },
        include: {
          organizationMemberships: {
            include: {
              organization: true,
              orgRole: {
                select: { id: true, name: true, permissions: true },
              },
            },
          },
        },
      });

      if (!user || !user.isActive) {
        return done(null, false);
      }

      if (user.lockoutUntil && user.lockoutUntil > new Date()) {
        return done(null, false);
      }

      done(null, user);
    } catch (error) {
      done(error, null);
    }
  });
};
