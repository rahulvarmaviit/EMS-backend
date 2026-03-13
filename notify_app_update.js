const { PrismaClient } = require('@prisma/client');
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Initialize Prisma
const prisma = new PrismaClient();

// Initialize Firebase
const serviceAccountPath = path.join(process.cwd(), 'service-account.json');
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8')))
    });
}

async function notifyAppUpdate() {
    try {
        console.log('Starting app update notification...');

        const versionFilePath = path.join(process.cwd(), 'uploads', 'version.txt');

        if (!fs.existsSync(versionFilePath)) {
            console.error('Error: uploads/version.txt not found!');
            process.exit(1);
        }

        const newVersion = fs.readFileSync(versionFilePath, 'utf8').trim();
        console.log(`New version: ${newVersion}`);

        const users = await prisma.user.findMany({
            where: {
                is_active: true,
                fcm_token: { not: null }
            },
            select: {
                id: true,
                full_name: true,
                fcm_token: true,
            },
        });

        console.log(`Found ${users.length} active users with FCM tokens`);

        // Create database notifications
        const notificationData = users.map((user) => ({
            user_id: user.id,
            type: 'EVENT_CREATED',
            title: `Update Available v${newVersion}`,
            message: `A new version of the app is available. Please update to get the latest features and improvements.`,
            data: JSON.parse(JSON.stringify({ version: newVersion, updateAvailable: true }))
        }));

        await prisma.notification.createMany({ data: notificationData });
        console.log(`Created ${notificationData.length} database notifications`);

        // Send push notifications
        let successCount = 0;
        let errorCount = 0;

        for (const user of users) {
            if (user.fcm_token) {
                try {
                    await admin.messaging().send({
                        token: user.fcm_token,
                        notification: {
                            title: `Update Available v${newVersion}`,
                            body: 'A new version is available. Tap to update now!',
                        },
                        data: {
                            type: 'APP_UPDATE',
                            version: newVersion,
                        },
                    });
                    successCount++;
                    console.log(`✓ Sent to ${user.full_name}`);
                } catch (error) {
                    errorCount++;
                    console.error(`✗ Failed for ${user.full_name}:`, error.message);
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
