
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';

const prisma = new PrismaClient();

async function main() {
    try {
        console.log('--- Inspecting Recent Notifications ---');

        // Get last 50 notifications of type USER_LOGIN
        const notifications = await prisma.notification.findMany({
            where: {
                // type: 'USER_LOGIN' // Enum might be tricky if not imported, let's try strict string or just all recent
                title: { in: ['User Login', 'New User Signup'] }
            },
            orderBy: { created_at: 'desc' },
            take: 20,
            include: {
                user: { // The Recipient
                    select: {
                        id: true,
                        full_name: true,
                        role: true
                    }
                }
            }
        });

        const output = notifications.map(n => ({
            id: n.id,
            title: n.title,
            message: n.message,
            recipientName: n.user.full_name,
            recipientRole: n.user.role,
            createdAt: n.created_at
        }));

        fs.writeFileSync('debug_notifications_list.json', JSON.stringify(output, null, 2));
        console.log(`Exported ${notifications.length} notifications to debug_notifications_list.json`);

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
