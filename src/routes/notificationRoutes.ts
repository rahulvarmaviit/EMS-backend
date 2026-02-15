// Notification Routes
// Purpose: API endpoints for notification management

import { Router } from 'express';
import notificationController from '../controllers/notificationController';
import { authenticate } from '../middlewares/auth';

const router = Router();

// Apply authentication middleware to all routes
router.use(authenticate);

// GET /api/notifications - Get user's notifications
router.get('/', notificationController.getNotifications);

// GET /api/notifications/unread-count - Get unread count
router.get('/unread-count', notificationController.getUnreadCount);

// PATCH /api/notifications/read-all - Mark all as read
router.patch('/read-all', notificationController.markAllAsRead);

// PATCH /api/notifications/:id/read - Mark single as read
router.patch('/:id/read', notificationController.markAsRead);

// DELETE /api/notifications/:id - Delete notification
router.delete('/:id', notificationController.deleteNotification);

// POST /api/notifications/register-token - Register FCM token
router.post('/register-token', notificationController.registerFcmToken);

export default router;
