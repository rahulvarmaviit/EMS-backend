
import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    const superAdminPhone = '1001021001';
    const superAdminPassword = 'superadmin';
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(superAdminPassword, salt);

    console.log(`Checking for Super Admin user (${superAdminPhone})...`);

    const existingUser = await prisma.user.findUnique({
        where: { mobile_number: superAdminPhone },
    });

    if (existingUser) {
        console.log('Super Admin user exists. Updating credentials and role...');
        await prisma.user.update({
            where: { id: existingUser.id },
            data: {
                password_hash: hashedPassword,
                role: 'POSTGRES_SQL' as any,
                full_name: 'PostgreSQL',
                is_active: true,
            },
        });
        console.log('Super Admin updated successfully.');
    } else {
        console.log('Super Admin user does not exist. Creating...');
        await prisma.user.create({
            data: {
                mobile_number: superAdminPhone,
                password_hash: hashedPassword,
                full_name: 'PostgreSQL',
                role: 'POSTGRES_SQL' as any,
                is_active: true,
            },
        });
        console.log('Super Admin created successfully.');
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
