import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function migrateEnum() {
    try {
        console.log('Adding POSTGRES_SQL to Role enum...');

        // Add the new enum value (must be outside transaction)
        await prisma.$executeRawUnsafe(`ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'POSTGRES_SQL'`);

        console.log('✓ POSTGRES_SQL enum value added');

        // Update existing users
        const result = await prisma.$executeRaw`UPDATE "users" SET "role" = 'POSTGRES_SQL'::"Role" WHERE "role" = 'SUPER_ADMIN'::"Role"`;

        console.log(`✓ Updated ${result} user(s) from SUPER_ADMIN to POSTGRES_SQL`);

    } catch (error) {
        console.error('Migration error:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

migrateEnum();
