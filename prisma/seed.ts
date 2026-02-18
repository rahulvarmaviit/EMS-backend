
import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { seedQuotes } from './seed_quotes';

const prisma = new PrismaClient();

async function main() {
    const superAdminEmployeeId = '1001021001';
    const superAdminPassword = 'superadmin';
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(superAdminPassword, salt);

    console.log(`Checking for Super Admin user (${superAdminEmployeeId})...`);

    const existingUser = await prisma.user.findUnique({
        where: { employee_id: superAdminEmployeeId },
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
                must_change_password: false, // Super admin should not be forced to change password
            },
        });
        console.log('Super Admin updated successfully.');
    } else {
        console.log('Super Admin user does not exist. Creating...');
        await prisma.user.create({
            data: {
                employee_id: superAdminEmployeeId,
                mobile_number: '1001021001',
                password_hash: hashedPassword,
                full_name: 'PostgreSQL',
                role: 'POSTGRES_SQL' as any,
                is_active: true,
                must_change_password: false,
            },
        });
        console.log('Super Admin created successfully.');
    }

    // Seed Quotes
    await seedQuotes(prisma);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
