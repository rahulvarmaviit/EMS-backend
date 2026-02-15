// Notification Controller
// Purpose: Handle notification CRUD operations for users

import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

// GET /api/notifications
// Get current user's notifications (paginated)
async function getNotifications(req: Request, res: Response): Promise<void> {
    try {
        const userId = (req as any).user?.id;
        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        const page = parseInt(req.query.page as string) || 1;
        const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
        const skip = (page - 1) * limit;
        const unreadOnly = req.query.unread === 'true';

        const whereClause = {
            user_id: userId,
            ...(unreadOnly ? { is_read: false } : {}),
        };

        const [notifications, total, unreadCount] = await Promise.all([
            prisma.notification.findMany({
                where: whereClause,
                orderBy: { created_at: 'desc' },
                skip,
                take: limit,
            }),
            prisma.notification.count({ where: whereClause }),
            prisma.notification.count({
                where: { user_id: userId, is_read: false },
            }),
        ]);

        res.json({
            success: true,
            data: {
                notifications,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit),
                },
                unread_count: unreadCount,
            },
        });
    } catch (error) {
        logger.error('Error fetching notifications:', { error });
        res.status(500).json({ error: 'Failed to fetch notifications' });
    }
}

// GET /api/notifications/unread-count
// Get unread notification count
async function getUnreadCount(req: Request, res: Response): Promise<void> {
    try {
        const userId = (req as any).user?.id;
        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        const unreadCount = await prisma.notification.count({
            where: { user_id: userId, is_read: false },
        });

        res.json({ success: true, data: { unread_count: unreadCount } });
    } catch (error) {
        logger.error('Error fetching unread count:', { error });
        res.status(500).json({ error: 'Failed to fetch unread count' });
    }
}

// PATCH /api/notifications/:id/read
// Mark a notification as read
async function markAsRead(req: Request, res: Response): Promise<void> {
    try {
        const userId = (req as any).user?.id;
        const { id } = req.params;

        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        // Find and verify ownership
        const notification = await prisma.notification.findFirst({
            where: { id, user_id: userId },
        });

        if (!notification) {
            res.status(404).json({ error: 'Notification not found' });
            return;
        }

        const updated = await prisma.notification.update({
            where: { id },
            data: { is_read: true },
        });

        res.json({ success: true, data: { notification: updated } });
    } catch (error) {
        logger.error('Error marking notification as read:', { error });
        res.status(500).json({ error: 'Failed to mark notification as read' });
    }
}

// PATCH /api/notifications/read-all
// Mark all notifications as read
async function markAllAsRead(req: Request, res: Response): Promise<void> {
    try {
        const userId = (req as any).user?.id;
        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        await prisma.notification.updateMany({
            where: { user_id: userId, is_read: false },
            data: { is_read: true },
        });

        res.json({ success: true, message: 'All notifications marked as read' });
    } catch (error) {
        logger.error('Error marking all notifications as read:', { error });
        res.status(500).json({ error: 'Failed to mark all notifications as read' });
    }
}

// DELETE /api/notifications/:id
// Delete a notification
async function deleteNotification(req: Request, res: Response): Promise<void> {
    try {
        const userId = (req as any).user?.id;
        const { id } = req.params;

        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        // Find and verify ownership
        const notification = await prisma.notification.findFirst({
            where: { id, user_id: userId },
        });

        if (!notification) {
            res.status(404).json({ error: 'Notification not found' });
            return;
        }

        await prisma.notification.delete({ where: { id } });

        res.json({ success: true, message: 'Notification deleted' });
    } catch (error) {
        logger.error('Error deleting notification:', { error });
        res.status(500).json({ error: 'Failed to delete notification' });
    }
}

// POST /api/notifications/register-token
// Register FCM token for push notifications
async function registerFcmToken(req: Request, res: Response): Promise<void> {
    try {
        const userId = (req as any).user?.id;
        const { fcm_token } = req.body;

        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        if (!fcm_token) {
            res.status(400).json({ error: 'FCM token is required' });
            return;
        }

        await prisma.user.update({
            where: { id: userId },
            data: { fcm_token },
        });

        res.json({ success: true, message: 'FCM token registered successfully' });
    } catch (error) {
        logger.error('Error registering FCM token:', { error });
        res.status(500).json({ error: 'Failed to register FCM token' });
    }
}

export default {
    getNotifications,
    getUnreadCount,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    registerFcmToken,
};
