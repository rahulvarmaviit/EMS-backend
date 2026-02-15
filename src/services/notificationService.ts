// Notification Service
// Purpose: Handle notification creation, FCM push, and Socket.IO real-time updates

import { prisma } from '../config/database';
import { NotificationType } from '@prisma/client';
import { logger } from '../utils/logger';
import admin from 'firebase-admin';
import { io } from '../index'; // Import Socket.IO instance

// Initialize Firebase Admin SDK
let firebaseInitialized = false;

function initializeFirebase() {
    if (firebaseInitialized) return;

    try {
        // Check if service account credentials are available
        const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

        if (serviceAccountPath) {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const path = require('path');
            const absolutePath = path.isAbsolute(serviceAccountPath)
                ? serviceAccountPath
                : path.resolve(process.cwd(), serviceAccountPath);

            logger.info(`Loading Firebase config from: ${absolutePath}`);
            const serviceAccount = require(absolutePath);
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
            });
            firebaseInitialized = true;
            logger.info('Firebase Admin SDK initialized successfully');
        } else {
            logger.warn('Firebase service account not configured. Push notifications disabled.');
        }
    } catch (error) {
        // Enhanced error logging
        if (error instanceof Error) {
            logger.error('Failed to initialize Firebase Admin SDK:', { error: error.message, stack: error.stack });
        } else {
            logger.error('Failed to initialize Firebase Admin SDK:', { error: String(error) });
        }
    }
}

// Initialize on module load
initializeFirebase();

/**
 * Send push notification via Firebase Cloud Messaging
 */
async function sendPushNotification(
    fcmToken: string,
    title: string,
    message: string,
    data?: Record<string, string>
): Promise<boolean> {
    if (!firebaseInitialized || !fcmToken) {
        return false;
    }

    try {
        await admin.messaging().send({
            token: fcmToken,
            notification: {
                title,
                body: message,
            },
            data: data || {},
            android: {
                priority: 'high',
                notification: {
                    sound: 'default',
                    channelId: 'ems_notifications',
                },
            },
            apns: {
                payload: {
                    aps: {
                        sound: 'default',
                        badge: 1,
                    },
                },
            },
        });
        logger.info(`Push notification sent to token: ${fcmToken.substring(0, 20)}...`);
        return true;
    } catch (error) {
        logger.error('Failed to send push notification:', { error });
        return false;
    }
}

/**
 * Create a notification and optionally send push notification + Socket.IO event
 */
export async function createNotification(
    userId: string,
    type: NotificationType,
    title: string,
    message: string,
    data?: Record<string, unknown>
): Promise<void> {
    try {
        // Create notification in database
        const notification = await prisma.notification.create({
            data: {
                user_id: userId,
                type,
                title,
                message,
                data: (data as any) || null,
            },
        });

        // 1. Send Real-time update via Socket.IO
        if (io) {
            io.to(`user:${userId}`).emit('notification', notification);
        }

        // 2. Send Push Notification via FCM
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { fcm_token: true },
        });

        if (user?.fcm_token) {
            const pushData: Record<string, string> = {
                type,
                notificationId: notification.id,
                ...(data ? Object.fromEntries(
                    Object.entries(data).map(([k, v]) => [k, String(v)])
                ) : {}),
            };
            await sendPushNotification(user.fcm_token, title, message, pushData);
        }
    } catch (error) {
        logger.error('Failed to create notification:', { error });
        // Don't throw - notifications should not break main operations
    }
}

/**
 * Notify all users with a specific role
 */
export async function notifyUsersByRole(
    role: 'ADMIN' | 'LEAD' | 'EMPLOYEE',
    type: NotificationType,
    title: string,
    message: string,
    data?: Record<string, unknown>,
    excludeUserId?: string
): Promise<void> {
    try {
        const users = await prisma.user.findMany({
            where: {
                role,
                is_active: true,
                ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
            },
            select: { id: true },
        });

        await Promise.all(
            users.map((user) => createNotification(user.id, type, title, message, data))
        );
    } catch (error) {
        logger.error(`Failed to notify users with role ${role}:`, { error });
    }
}

/**
 * Notify team lead about team member events
 */
export async function notifyTeamLead(
    teamId: string | null,
    type: NotificationType,
    title: string,
    message: string,
    data?: Record<string, unknown>
): Promise<void> {
    if (!teamId) return;

    try {
        const team = await prisma.team.findUnique({
            where: { id: teamId },
            select: { lead_id: true },
        });

        if (team?.lead_id) {
            await createNotification(team.lead_id, type, title, message, data);
        }
    } catch (error) {
        logger.error('Failed to notify team lead:', { error });
    }
}

export default {
    createNotification,
    notifyUsersByRole,
    notifyTeamLead,
    sendPushNotification,
};
