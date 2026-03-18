import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
const prisma = new PrismaClient();

async function checkTask() {
  const taskId = 'ebc95177-4267-4a7d-98d9-31339b0dee69';
  const task = await prisma.taskAssignment.findUnique({
    where: { id: taskId },
    include: { assigned_to: true, assigned_by: true }
  });
  
  let output = '';
  if (task) {
    output += `ID: ${task.id}\n`;
    output += `Title: ${task.title}\n`;
    output += `Assigned To: ${task.assigned_to.full_name} (${task.assigned_to_id})\n`;
    output += `Assigned By: ${task.assigned_by.full_name} (${task.assigned_by_id})\n`;
  } else {
    output += `Task ${taskId} NOT FOUND\n`;
  }
  
  fs.writeFileSync('task_debug.txt', output);
}

checkTask().then(() => prisma.$disconnect());
