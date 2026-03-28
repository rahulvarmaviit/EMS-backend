import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    const task = await prisma.taskAssignment.findFirst({
        include: {
            assigned_to: true,
            assigned_by: true
        }
    });

    if (!task) {
        console.log("No task found");
        return;
    }

    console.log("Task:", task.id);
    console.log("Assigned To:", task.assigned_to_id, task.assigned_to.role);
    console.log("Assigned By:", task.assigned_by_id, task.assigned_by.role);

    // try inserting a comment
    try {
        const comment = await prisma.taskComment.create({
            data: {
                text: "test comment",
                task_id: task.id,
                user_id: task.assigned_to_id
            }
        });
        console.log("Comment inserted successfully:", comment);
    } catch (e: any) {
        console.error("Error inserting comment:", e.message);
    }
}
main().catch(console.error).finally(() => prisma.$disconnect());
