import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
    const tasks = await prisma.taskAssignment.findMany({
        select: { id: true, title: true, status: true }
    });
    console.table(tasks);
}
main().finally(() => prisma.$disconnect());
