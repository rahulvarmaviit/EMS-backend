import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkTask() {
  const taskId = 'ebc95177-4267-4a7d-98d9-31339b0dee69';
  const task = await prisma.taskAssignment.findUnique({
    where: { id: taskId },
    include: { assigned_to: true, assigned_by: true }
  });
  
  if (task) {
    console.log('ID:', task.id);
    console.log('Title:', task.title);
    console.log('Assigned To:', task.assigned_to.full_name, '(', task.assigned_to_id, ')');
    console.log('Assigned By:', task.assigned_by.full_name, '(', task.assigned_by_id, ')');
  } else {
    console.log('Task ebc95177-4267-4a7d-98d9-31339b0dee69 NOT FOUND');
    
    // Check if it's a project task instead?
    const allTasks = await prisma.taskAssignment.findMany({
        take: 10,
        orderBy: { created_at: 'desc' }
    });
    console.log('Recent tasks:', allTasks.map(t => `${t.id}: ${t.title}`).join('\n'));
  }
}

checkTask().then(() => prisma.$disconnect());
