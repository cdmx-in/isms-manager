import { Router } from 'express';
import passport from 'passport';
import { prisma } from '../index.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { authenticate, generateTokens, verifyRefreshToken } from '../middleware/auth.js';
import { createAuditLog } from '../services/audit.service.js';

const router = Router();

// Register - disabled (Google OAuth only)
router.post('/register', (_req, res) => {
  res.status(403).json({
    success: false,
    error: { message: 'Registration is disabled. Please use Google sign-in.' },
  });
});

// Login - disabled (Google OAuth only)
router.post('/login', (_req, res) => {
  res.status(403).json({
    success: false,
    error: { message: 'Email/password login is disabled. Please use Google sign-in.' },
  });
});

// Refresh token
router.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const refreshToken = req.cookies['isms.refresh_token'] || req.body.refreshToken;

    if (!refreshToken) {
      throw new AppError('Refresh token is required', 401);
    }

    try {
      const payload = verifyRefreshToken(refreshToken);

      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          email: true,
          role: true,
          isActive: true,
        },
      });

      if (!user || !user.isActive) {
        throw new AppError('Invalid refresh token', 401);
      }

      const tokens = generateTokens(user);

      const isSecure = process.env.FRONTEND_URL?.startsWith('https') || process.env.NODE_ENV === 'production';

      res.cookie('isms.access_token', tokens.accessToken, {
        httpOnly: true,
        secure: isSecure,
        sameSite: 'lax',
        maxAge: 15 * 60 * 1000,
      });

      res.cookie('isms.refresh_token', tokens.refreshToken, {
        httpOnly: true,
        secure: isSecure,
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      res.json({
        success: true,
        data: {
          accessToken: tokens.accessToken,
        },
      });
    } catch {
      throw new AppError('Invalid refresh token', 401);
    }
  })
);

// Logout
router.post(
  '/logout',
  authenticate,
  asyncHandler(async (req, res) => {
    // Clear cookies
    res.clearCookie('isms.access_token');
    res.clearCookie('isms.refresh_token');

    // Audit log
    await createAuditLog({
      userId: req.user!.id,
      action: 'LOGOUT',
      entityType: 'User',
      entityId: req.user!.id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

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
              },
            },
          },
        },
      },
    });

    res.json({
      success: true,
      data: user,
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
      session: false,
    } as any)
  );

  router.get(
    '/google/callback',
    passport.authenticate('google', {
      session: false,
      failureRedirect: `${process.env.FRONTEND_URL}/login?error=google_auth_failed`,
    }),
    asyncHandler(async (req, res) => {
      const user = req.user!;
      const { accessToken, refreshToken } = generateTokens(user);

      const isSecure = process.env.FRONTEND_URL?.startsWith('https') || process.env.NODE_ENV === 'production';

      // Set cookies
      res.cookie('isms.access_token', accessToken, {
        httpOnly: true,
        secure: isSecure,
        sameSite: 'lax',
        maxAge: 15 * 60 * 1000,
      });

      res.cookie('isms.refresh_token', refreshToken, {
        httpOnly: true,
        secure: isSecure,
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

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

      // Redirect to frontend
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
