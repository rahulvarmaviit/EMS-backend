
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const mobileNumber = '7989498358';
  
  try {
    const user = await prisma.user.update({
      where: { mobile_number: mobileNumber },
      data: { role: 'ADMIN' },
    });
    console.log(`Successfully updated user ${user.full_name} (${user.mobile_number}) to ADMIN role.`);
  } catch (e) {
    console.error(`Error updating user: ${e}`);
  } finally {
    await prisma.$disconnect();
  }
}

main();
