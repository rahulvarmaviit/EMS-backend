import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkTask() {
  const tasks = await prisma.taskAssignment.findMany({
    where: { title: { contains: 'project' } },
    include: {
      assigned_to: { select: { id: true, full_name: true } },
      assigned_by: { select: { id: true, full_name: true } }
    }
  });
  
  tasks.forEach(task => {
    console.log('ID:', task.id);
    console.log('Title:', task.title);
    console.log('Status:', task.status);
    console.log('Assigned To:', task.assigned_to.full_name, '(', task.assigned_to_id, ')');
    console.log('Assigned By:', task.assigned_by.full_name, '(', task.assigned_by_id, ')');
    console.log('---');
  });
}

checkTask().then(() => prisma.$disconnect());
