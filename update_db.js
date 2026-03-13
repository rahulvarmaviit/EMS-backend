const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function updateToday() {
  const attendance = await prisma.attendance.findFirst({
    orderBy: { date: 'desc' },
  });
  
  if (attendance) {
    const updated = await prisma.attendance.update({
      where: { id: attendance.id },
      data: { is_remote: true }
    });
    console.log("Updated to remote=true:", updated.id);
  }
}

updateToday()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
