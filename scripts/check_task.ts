import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkTask() {
  const taskId = 'ebc95177-4267-4a7d-98d9-31339b0dee69';
  const userId = '8b2ce4f2-396e-47a7-9edf-b822a3c310a1';
  
  const task = await prisma.taskAssignment.findUnique({
    where: { id: taskId },
    include: { assigned_to: true, assigned_by: true }
  });
  
  console.log('Task:', JSON.stringify(task, null, 2));
  console.log('Target User ID:', userId);
  
  if (task) {
    console.log('Is assigned to user:', task.assigned_to_id === userId);
    console.log('Is assigned by user:', task.assigned_by_id === userId);
  } else {
    console.log('Task NOT FOUND');
  }
}

checkTask().then(() => prisma.$disconnect());
