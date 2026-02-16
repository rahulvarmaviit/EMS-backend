import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function createPostgresUser() {
    const mobile = '1001021001';
    const password = 'superadmin';

    try {
        // Check if user exists
        const existingUser = await prisma.user.findUnique({
            where: { mobile_number: mobile },
        });

        if (existingUser) {
            console.log('PostgreSQL User already exists.');
            // Update role if needed
            if (existingUser.role !== Role.POSTGRES_SQL) {
                await prisma.user.update({
                    where: { id: existingUser.id },
                    data: { role: Role.POSTGRES_SQL }
                });
                console.log('Updated existing user role to POSTGRES_SQL');
            }
            return;
        }

        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(password, salt);

        const user = await prisma.user.create({
            data: {
                mobile_number: mobile,
                password_hash: hash,
                full_name: 'PostgreSQL',
                role: Role.POSTGRES_SQL,
                is_active: true,
            },
        });

        console.log(`PostgreSQL User created: ${user.mobile_number}`);
    } catch (e) {
        console.error('Error creating PostgreSQL User:', e);
    } finally {
        await prisma.$disconnect();
    }
}

createPostgresUser();
