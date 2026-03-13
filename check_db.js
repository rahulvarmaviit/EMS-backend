const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const attendance = await prisma.attendance.findFirst({
    orderBy: { date: 'desc' },
  });
  console.log(JSON.stringify(attendance, null, 2));
}

check()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
