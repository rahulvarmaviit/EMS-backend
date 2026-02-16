import { prisma } from './src/config/database';
import notificationService from './src/services/notificationService';
import { NotificationType } from '@prisma/client';
import fs from 'fs';
import path from 'path';

/**
 * Script to notify all users about a new app update
 * Run this after uploading the new APK to the server
 */

async function notifyAppUpdate() {
    try {
        console.log('Starting app update notification...');

        // Read the new version from version.txt
        const versionFilePath = path.join(process.cwd(), 'uploads', 'version.txt');

        if (!fs.existsSync(versionFilePath)) {
            console.error('Error: uploads/version.txt not found!');
            console.log('Please create uploads/version.txt with the new version number (e.g., 1.0.1)');
            process.exit(1);
        }

        const newVersion = fs.readFileSync(versionFilePath, 'utf8').trim();
        console.log(`New version: ${newVersion}`);

        // Get all active users
        const users = await prisma.user.findMany({
            where: {
                is_active: true,
                fcm_token: { not: null } // Only users with FCM tokens
            },
            select: {
                id: true,
                full_name: true,
                fcm_token: true,
            },
        });

        console.log(`Found ${users.length} active users with FCM tokens`);

        // Create database notifications for all users
        const notificationData = users.map((user: any) => ({
            user_id: user.id,
            // Use EVENT_CREATED as a generic type since SYSTEM_ANNOUNCEMENT doesn't exist yet
            type: NotificationType.EVENT_CREATED,
            title: `Update Available v${newVersion}`,
            message: `A new version of the app is available. Please update to get the latest features and improvements.`,
            data: JSON.parse(JSON.stringify({ version: newVersion, updateAvailable: true }))
        }));

        await prisma.notification.createMany({
            data: notificationData,
        });

        console.log(`Created ${notificationData.length} database notifications`);

        // Send push notifications to all users
        let successCount = 0;
        let errorCount = 0;

        for (const user of users as any[]) {
            if (user.fcm_token) {
                try {
                    await notificationService.sendPushNotification(
                        user.fcm_token,
                        `Update Available v${newVersion}`,
                        'A new version is available. Tap to update now!',
                        {
                            type: 'APP_UPDATE',
                            version: newVersion,
                        }
                    );
                    successCount++;
                    console.log(`✓ Sent to ${user.full_name}`);
                } catch (error) {
                    errorCount++;
                    console.error(`✗ Failed for ${user.full_name}:`, (error as Error).message);
                }
            }
        }

        console.log('\n=== Notification Summary ===');
        console.log(`Total users: ${users.length}`);
        console.log(`Push notifications sent: ${successCount}`);
        console.log(`Push notifications failed: ${errorCount}`);
        console.log(`Database notifications created: ${notificationData.length}`);
        console.log('===========================\n');

    } catch (error) {
        console.error('Error notifying users:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

notifyAppUpdate();
