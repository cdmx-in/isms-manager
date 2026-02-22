import { Router } from 'express';
import passport from 'passport';
import { prisma, redisClient } from '../index.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { authenticate, requirePermission, AuthenticatedRequest } from '../middleware/auth.js';
import { createAuditLog } from '../services/audit.service.js';
import { getLegacyPermissions } from '../constants/permissions.js';
import { logger } from '../utils/logger.js';

const router = Router();

// Register - disabled (Google OAuth only)
router.post('/register', (_req, res) => {
  res.status(403).json({
    success: false,
    error: { message: 'Registration is disabled. Please use Google sign-in.' },
  });
});

// Login (email/password via Passport local strategy)
router.post(
  '/login',
  asyncHandler(async (req, res, next) => {
    passport.authenticate('local', (err: any, user: any, info: any) => {
      if (err) return next(err);
      if (!user) {
        return res.status(401).json({
          success: false,
          error: { message: info?.message || 'Invalid email or password' },
        });
      }
      req.logIn(user, async (loginErr) => {
        if (loginErr) return next(loginErr);

        await createAuditLog({
          userId: user.id,
          action: 'LOGIN',
          entityType: 'User',
          entityId: user.id,
          newValues: { provider: 'local' },
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
        });

        // Return user data with effective permissions
        const userData = { ...user } as any;
        if (userData.organizationMemberships) {
          userData.organizationMemberships = userData.organizationMemberships.map((m: any) => ({
            ...m,
            effectivePermissions: m.orgRole
              ? m.orgRole.permissions
              : getLegacyPermissions(m.role),
          }));
        }

        res.json({ success: true, data: userData });
      });
    })(req, res, next);
  })
);

// Logout — destroy session in Redis
router.post(
  '/logout',
  authenticate,
  asyncHandler(async (req, res) => {
    // Audit log before destroying session
    await createAuditLog({
      userId: req.user!.id,
      action: 'LOGOUT',
      entityType: 'User',
      entityId: req.user!.id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    // Passport logout
    req.logout((err) => {
      if (err) {
        logger.error('Logout error:', err);
      }
    });

    // Destroy session in Redis
    req.session.destroy((err) => {
      if (err) {
        logger.error('Session destroy error:', err);
      }
    });

    // Clear session cookie
    res.clearCookie('isms.sid');

    res.json({
      success: true,
      message: 'Logged out successfully',
    });
  })
);

// Get current user
router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        avatar: true,
        designation: true,
        authProvider: true,
        isEmailVerified: true,
        createdAt: true,
        lastLoginAt: true,
        organizationMemberships: {
          include: {
            organization: {
              select: {
                id: true,
                name: true,
                slug: true,
                logo: true,
                enabledServices: true,
              },
            },
            orgRole: {
              select: {
                id: true,
                name: true,
                permissions: true,
              },
            },
          },
        },
      },
    });

    // Compute effective permissions per membership
    const userData = user as any;
    if (userData?.organizationMemberships) {
      userData.organizationMemberships = userData.organizationMemberships.map((m: any) => ({
        ...m,
        effectivePermissions: m.orgRole
          ? m.orgRole.permissions
          : getLegacyPermissions(m.role),
      }));
    }

    res.json({
      success: true,
      data: userData,
    });
  })
);

// Google OAuth (only register routes if Google credentials are configured)
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  router.get(
    '/google',
    passport.authenticate('google', {
      scope: ['profile', 'email', 'https://www.googleapis.com/auth/drive.readonly'],
      accessType: 'offline',
      prompt: 'consent',
    } as any)
  );

  router.get(
    '/google/callback',
    passport.authenticate('google', {
      failureRedirect: `${process.env.FRONTEND_URL}/login?error=google_auth_failed`,
    }),
    asyncHandler(async (req, res) => {
      // passport.authenticate with sessions auto-calls req.login()
      // which serializes user.id into the Redis session
      const user = req.user!;

      // Audit log
      await createAuditLog({
        userId: user.id,
        action: 'LOGIN',
        entityType: 'User',
        entityId: user.id,
        newValues: { provider: 'google' },
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });

      // Redirect to frontend — isms.sid cookie is already set by express-session
      res.redirect(`${process.env.FRONTEND_URL}/dashboard`);
    })
  );
} else {
  router.get('/google', (_req, res) => {
    res.status(501).json({
      success: false,
      error: { message: 'Google OAuth is not configured' },
    });
  });
}

// ============================================
// SESSION MANAGEMENT (Admin)
// ============================================

// List active sessions for an organization's users
router.get(
  '/sessions',
  authenticate,
  requirePermission('users', 'view'),
  asyncHandler(async (req, res) => {
    const { organizationId } = req.query;

    if (!organizationId) {
      throw new AppError('Organization ID is required', 400);
    }

    // Get all users in this organization with their roles and last login
    const members = await prisma.organizationMember.findMany({
      where: { organizationId: organizationId as string },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            avatar: true,
            authProvider: true,
            lastLoginAt: true,
            isActive: true,
            createdAt: true,
          },
        },
        orgRole: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // Scan Redis for active sessions and match to users
    const sessionKeys = await redisClient.keys('isms:sess:*');
    const activeSessions: { [userId: string]: { count: number; lastActive: string | null } } = {};

    for (const key of sessionKeys) {
      try {
        const raw = await redisClient.get(key);
        if (!raw) continue;
        const sessionData = JSON.parse(raw as string);
        const userId = sessionData?.passport?.user;
        if (!userId) continue;

        if (!activeSessions[userId]) {
          activeSessions[userId] = { count: 0, lastActive: null };
        }
        activeSessions[userId].count++;

        // Use cookie maxAge or session expiry as proxy for last active
        if (sessionData.cookie?.expires) {
          const expires = sessionData.cookie.expires;
          if (!activeSessions[userId].lastActive || expires > activeSessions[userId].lastActive!) {
            activeSessions[userId].lastActive = expires;
          }
        }
      } catch {
        // Skip malformed session data
      }
    }

    const data = members.map((m: any) => ({
      memberId: m.id,
      user: m.user,
      orgRole: m.orgRole,
      legacyRole: m.role,
      activeSessions: activeSessions[m.userId]?.count || 0,
    }));

    res.json({
      success: true,
      data,
      summary: {
        totalMembers: members.length,
        totalActiveSessions: sessionKeys.length,
      },
    });
  })
);

// Revoke all sessions for a specific user (admin action)
router.delete(
  '/sessions/:userId',
  authenticate,
  requirePermission('users', 'edit'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const { userId } = req.params;

    // Verify target user exists
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, firstName: true, lastName: true },
    });

    if (!targetUser) {
      throw new AppError('User not found', 404);
    }

    // Scan Redis sessions and delete those belonging to this user
    const sessionKeys = await redisClient.keys('isms:sess:*');
    let revokedCount = 0;

    for (const key of sessionKeys) {
      try {
        const raw = await redisClient.get(key);
        if (!raw) continue;
        const sessionData = JSON.parse(raw as string);
        if (sessionData?.passport?.user === userId) {
          await redisClient.del(key);
          revokedCount++;
        }
      } catch {
        // Skip malformed session data
      }
    }

    await createAuditLog({
      userId: authReq.user.id,
      action: 'DELETE',
      entityType: 'Session',
      entityId: userId,
      newValues: { revokedSessions: revokedCount, targetUser: targetUser.email },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({
      success: true,
      message: `Revoked ${revokedCount} session(s) for ${targetUser.firstName} ${targetUser.lastName}`,
      data: { revokedCount },
    });
  })
);

// Password reset - disabled (Google OAuth only)
router.post('/forgot-password', (_req, res) => {
  res.status(403).json({
    success: false,
    error: { message: 'Password reset is not available. Please use Google sign-in.' },
  });
});

router.post('/reset-password/:token', (_req, res) => {
  res.status(403).json({
    success: false,
    error: { message: 'Password reset is not available. Please use Google sign-in.' },
  });
});

export default router;
