
import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function createAdmin() {
    const mobile = '7989498358';
    const password = 'admin123';

    try {
        // Check if user exists
        const existingUser = await prisma.user.findUnique({
            where: { mobile_number: mobile },
        });

        if (existingUser) {
            console.log('User already exists.');
            return;
        }

        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(password, salt);

        const user = await prisma.user.create({
            data: {
                mobile_number: mobile,
                password_hash: hash,
                full_name: 'Admin User',
                role: Role.ADMIN,
                is_active: true,
            },
        });

        console.log(`Admin created: ${user.mobile_number}`);
    } catch (e) {
        console.error('Error creating admin:', e);
    } finally {
        await prisma.$disconnect();
    }
}

createAdmin();
