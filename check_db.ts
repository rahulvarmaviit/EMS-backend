
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function check() {
    try {
        const userCount = await prisma.user.count();
        console.log(`User count: ${userCount}`);

        if (userCount > 0) {
            const users = await prisma.user.findMany({ take: 5 });
            console.log('Sample users:', users);
        } else {
            console.log('No users found.');
        }
    } catch (e) {
        console.error('Error checking DB:', e);
    } finally {
        await prisma.$disconnect();
    }
}

check();
