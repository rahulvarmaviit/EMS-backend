
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

import readline from 'readline';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (query: string): Promise<string> => {
    return new Promise((resolve) => {
        rl.question(query, resolve);
    });
};

async function main() {
    console.log('--- Create Admin User ---');

    // Get interactive input
    const mobileNumber = await question('Enter Mobile Number (default: 7989498358): ') || '7989498358';
    const fullName = await question('Enter Full Name (default: Admin User): ') || 'Admin User';
    const password = await question('Enter Password (default: admin123): ') || 'admin123';

    rl.close();

    const role = 'ADMIN';

    console.log(`\nChecking for user: ${mobileNumber}...`);

    const existingUser = await prisma.user.findUnique({
        where: { mobile_number: mobileNumber },
    });

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    if (existingUser) {
        console.log('User found. Updating password and role...');
        await prisma.user.update({
            where: { id: existingUser.id },
            data: {
                password_hash: passwordHash,
                role: role,
                is_active: true,
                full_name: fullName, // Update name too
            },
        });
        console.log('✅ Admin updated successfully.');
    } else {
        console.log('User not found. Creating new admin user...');
        await prisma.user.create({
            data: {
                mobile_number: mobileNumber,
                password_hash: passwordHash,
                full_name: fullName,
                role: role,
                is_active: true,
            },
        });
        console.log('✅ Admin created successfully.');
    }
}

main()
    .catch((e) => {
        console.error('Error:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
