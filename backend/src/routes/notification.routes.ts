import { Router } from 'express';
import { prisma } from '../index.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

// Get notifications for current user
router.get(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId, unreadOnly, limit = 20 } = req.query;

    const where: any = { userId: authReq.user.id };
    if (organizationId) where.organizationId = organizationId;
    if (unreadOnly === 'true') where.isRead = false;

    const notifications = await prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Number(limit),
    });

    res.json({ success: true, data: notifications });
  })
);

// Get unread count for current user
router.get(
  '/count',
  authenticate,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId } = req.query;

    const where: any = { userId: authReq.user.id, isRead: false };
    if (organizationId) where.organizationId = organizationId;

    const count = await prisma.notification.count({ where });

    res.json({ success: true, data: { count } });
  })
);

// Mark single notification as read
router.patch(
  '/:id/read',
  authenticate,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const { id } = req.params;

    const notification = await prisma.notification.findFirst({
      where: { id, userId: authReq.user.id },
    });

    if (!notification) {
      throw new AppError('Notification not found', 404);
    }

    const updated = await prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });

    res.json({ success: true, data: updated });
  })
);

// Mark all notifications as read
router.post(
  '/mark-all-read',
  authenticate,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId } = req.body;

    const where: any = { userId: authReq.user.id, isRead: false };
    if (organizationId) where.organizationId = organizationId;

    await prisma.notification.updateMany({
      where,
      data: { isRead: true },
    });

    res.json({ success: true, message: 'All notifications marked as read' });
  })
);

export default router;
