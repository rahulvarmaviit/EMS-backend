
import { PrismaClient } from '@prisma/client';
declare const process: any;

const prisma = new PrismaClient();

async function main() {
    const mobileNumber = '7989498358';
    const admin = await prisma.user.findUnique({
        where: { mobile_number: '7989498358' },
    });

    if (admin) {
        console.log('Admin found:', admin);
    } else {
        console.log('Admin not found');
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
