// Task Assignment Controller
// Purpose: CRUD operations for team lead → employee task assignments

import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { createNotification } from '../services/notificationService';
import { NotificationType } from '@prisma/client';
import { io } from '../index';
import fs from 'fs';
import path from 'path';

/**
 * POST /api/tasks
 * Create a new task assignment (LEAD only)
 * Expects multipart/form-data with optional file uploads (field: "documents")
 */
export async function createTask(req: Request, res: Response): Promise<void> {
    try {
        const leadId = req.user?.userId;
        if (!leadId) {
            res.status(401).json({ success: false, error: 'Unauthorized' });
            return;
        }

        const { title, description, priority, start_date, end_date, assigned_to_id } = req.body;

        // Validate required fields
        if (!title || !title.trim()) {
            res.status(400).json({ success: false, error: 'Task title is required' });
            return;
        }
        if (title.trim().length > 100) {
            res.status(400).json({ success: false, error: 'Task title must be 100 characters or less' });
            return;
        }
        if (!description || !description.trim()) {
            res.status(400).json({ success: false, error: 'Task description is required' });
            return;
        }
        if (!assigned_to_id) {
            res.status(400).json({ success: false, error: 'Employee ID is required' });
            return;
        }
        if (!start_date || !end_date) {
            res.status(400).json({ success: false, error: 'Start date and end date are required' });
            return;
        }

        const startDate = new Date(start_date);
        const endDate = new Date(end_date);

        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
            res.status(400).json({ success: false, error: 'Invalid date format' });
            return;
        }
        if (endDate <= startDate) {
            res.status(400).json({ success: false, error: 'End date must be after start date' });
            return;
        }

        // Validate priority
        const validPriorities = ['P1', 'P2', 'P3'];
        const taskPriority = priority && validPriorities.includes(priority) ? priority : 'P3';

        // Verify employee exists and belongs to a team led by this lead
        const employee = await prisma.user.findFirst({
            where: { id: assigned_to_id, is_active: true },
            select: { id: true, full_name: true, team_id: true },
        });

        if (!employee) {
            res.status(404).json({ success: false, error: 'Employee not found' });
            return;
        }

        // Check that lead manages the employee's team
        if (employee.team_id) {
            const team = await prisma.team.findFirst({
                where: { id: employee.team_id, lead_id: leadId },
            });
            if (!team) {
                res.status(403).json({ success: false, error: 'You can only assign tasks to employees in your team' });
                return;
            }
        } else {
            res.status(400).json({ success: false, error: 'Employee is not assigned to any team' });
            return;
        }

        // Create the task
        const task = await prisma.taskAssignment.create({
            data: {
                title: title.trim(),
                description: description.trim(),
                priority: taskPriority,
                start_date: startDate,
                end_date: endDate,
                assigned_to_id,
                assigned_by_id: leadId,
            },
        });

        // Handle file uploads
        const files = req.files as Express.Multer.File[] | undefined;
        if (files && files.length > 0) {
            const docData = files.map((file) => ({
                file_name: file.originalname,
                file_path: file.path,
                file_size: file.size,
                mime_type: file.mimetype,
                task_id: task.id,
            }));

            await prisma.taskDocument.createMany({ data: docData });
        }

        // Fetch the full task with documents and assigned_by info
        const fullTask = await prisma.taskAssignment.findUnique({
            where: { id: task.id },
            include: {
                documents: true,
                assigned_by: { select: { id: true, full_name: true } },
                assigned_to: { select: { id: true, full_name: true } },
            },
        });

        // Send notification to employee
        const lead = await prisma.user.findUnique({
            where: { id: leadId },
            select: { full_name: true },
        });

        await createNotification(
            assigned_to_id,
            NotificationType.TASK_ASSIGNED,
            'New Task Assigned',
            `${lead?.full_name || 'Your Team Lead'} assigned you a new task: ${title.trim()}`,
            { taskId: task.id, priority: taskPriority }
        );

        // Emit real-time socket event
        if (io) {
            io.to(`user:${assigned_to_id}`).emit('task_assigned', fullTask);
        }

        logger.info('Task created', {
            taskId: task.id,
            assignedTo: assigned_to_id,
            assignedBy: leadId,
        });

        res.status(201).json({
            success: true,
            message: 'Task assigned successfully',
            data: { task: fullTask },
        });
    } catch (error) {
        logger.error('Create task error', { error: (error as Error).message });
        res.status(500).json({ success: false, error: 'Failed to create task' });
    }
}

/**
 * GET /api/tasks/my
 * Get all tasks assigned to the logged-in user
 */
export async function getMyTasks(req: Request, res: Response): Promise<void> {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            res.status(401).json({ success: false, error: 'Unauthorized' });
            return;
        }

        const tasks = await prisma.taskAssignment.findMany({
            where: { assigned_to_id: userId },
            include: {
                documents: true,
                assigned_by: { select: { id: true, full_name: true } },
            },
            orderBy: { created_at: 'desc' },
        });

        res.json({
            success: true,
            data: { tasks },
        });
    } catch (error) {
        logger.error('Get my tasks error', { error: (error as Error).message });
        res.status(500).json({ success: false, error: 'Failed to fetch tasks' });
    }
}

/**
 * GET /api/tasks/created
 * Get all tasks created by (assigned by) the logged-in lead
 */
export async function getCreatedTasks(req: Request, res: Response): Promise<void> {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            res.status(401).json({ success: false, error: 'Unauthorized' });
            return;
        }

        const tasks = await prisma.taskAssignment.findMany({
            where: { assigned_by_id: userId },
            include: {
                documents: true,
                assigned_to: { select: { id: true, full_name: true } },
                assigned_by: { select: { id: true, full_name: true } },
            },
            orderBy: { created_at: 'desc' },
        });

        res.json({
            success: true,
            data: { tasks },
        });
    } catch (error) {
        logger.error('Get created tasks error', { error: (error as Error).message });
        res.status(500).json({ success: false, error: 'Failed to fetch created tasks' });
    }
}

/**
 * GET /api/tasks/employee/:employeeId
 * Get all tasks created by this lead for a specific employee
 */
export async function getTasksForEmployee(req: Request, res: Response): Promise<void> {
    try {
        const leadId = req.user?.userId;
        const { employeeId } = req.params;

        if (!leadId) {
            res.status(401).json({ success: false, error: 'Unauthorized' });
            return;
        }

        const tasks = await prisma.taskAssignment.findMany({
            where: {
                assigned_to_id: employeeId,
                assigned_by_id: leadId,
            },
            include: {
                documents: true,
                assigned_by: { select: { id: true, full_name: true } },
                assigned_to: { select: { id: true, full_name: true } },
            },
            orderBy: { created_at: 'desc' },
        });

        res.json({
            success: true,
            data: { tasks },
        });
    } catch (error) {
        logger.error('Get tasks for employee error', { error: (error as Error).message });
        res.status(500).json({ success: false, error: 'Failed to fetch tasks' });
    }
}

/**
 * PATCH /api/tasks/:id
 * Update task details (LEAD only — the one who created it)
 */
export async function updateTask(req: Request, res: Response): Promise<void> {
    try {
        const leadId = req.user?.userId;
        const { id } = req.params;
        const { title, description, priority, start_date, end_date } = req.body;

        if (!leadId) {
            res.status(401).json({ success: false, error: 'Unauthorized' });
            return;
        }

        // Verify task exists and was created by this lead
        const existing = await prisma.taskAssignment.findUnique({
            where: { id },
            select: { assigned_by_id: true, assigned_to_id: true },
        });

        if (!existing) {
            res.status(404).json({ success: false, error: 'Task not found' });
            return;
        }
        if (existing.assigned_by_id !== leadId) {
            res.status(403).json({ success: false, error: 'You can only edit tasks you created' });
            return;
        }

        // Build update data
        const updateData: Record<string, unknown> = {};
        if (title !== undefined) {
            if (title.trim().length === 0) {
                res.status(400).json({ success: false, error: 'Title cannot be empty' });
                return;
            }
            if (title.trim().length > 100) {
                res.status(400).json({ success: false, error: 'Title must be 100 characters or less' });
                return;
            }
            updateData.title = title.trim();
        }
        if (description !== undefined) {
            if (description.trim().length === 0) {
                res.status(400).json({ success: false, error: 'Description cannot be empty' });
                return;
            }
            updateData.description = description.trim();
        }
        if (priority !== undefined) {
            const validPriorities = ['P1', 'P2', 'P3'];
            if (!validPriorities.includes(priority)) {
                res.status(400).json({ success: false, error: 'Invalid priority. Use P1, P2, or P3' });
                return;
            }
            updateData.priority = priority;
        }
        if (start_date !== undefined) {
            updateData.start_date = new Date(start_date);
        }
        if (end_date !== undefined) {
            updateData.end_date = new Date(end_date);
        }

        // Validate dates if both present
        const newStart = updateData.start_date as Date | undefined;
        const newEnd = updateData.end_date as Date | undefined;
        if (newStart && newEnd && newEnd <= newStart) {
            res.status(400).json({ success: false, error: 'End date must be after start date' });
            return;
        }

        if (Object.keys(updateData).length === 0) {
            res.status(400).json({ success: false, error: 'No fields to update' });
            return;
        }

        const updatedTask = await prisma.taskAssignment.update({
            where: { id },
            data: updateData,
            include: {
                documents: true,
                assigned_by: { select: { id: true, full_name: true } },
                assigned_to: { select: { id: true, full_name: true } },
            },
        });

        // Notify employee about updates
        await createNotification(
            existing.assigned_to_id,
            NotificationType.TASK_UPDATED,
            'Task Updated',
            `Your task "${updatedTask.title}" has been updated by your team lead`,
            { taskId: id }
        );

        // Real-time update
        if (io) {
            io.to(`user:${existing.assigned_to_id}`).emit('task_updated', updatedTask);
        }

        logger.info('Task updated', { taskId: id, updatedBy: leadId });

        res.json({
            success: true,
            message: 'Task updated successfully',
            data: { task: updatedTask },
        });
    } catch (error) {
        logger.error('Update task error', { error: (error as Error).message });
        res.status(500).json({ success: false, error: 'Failed to update task' });
    }
}

/**
 * PATCH /api/tasks/:id/status
 * Update task status (Employee or Lead)
 */
export async function updateTaskStatus(req: Request, res: Response): Promise<void> {
    try {
        const userId = req.user?.userId;
        const { id } = req.params;
        const { status } = req.body;

        if (!userId) {
            res.status(401).json({ success: false, error: 'Unauthorized' });
            return;
        }

        const validStatuses = ['PENDING', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED'];
        if (!status || !validStatuses.includes(status)) {
            res.status(400).json({ success: false, error: 'Invalid status. Use PENDING, IN_PROGRESS, BLOCKED, or COMPLETED' });
            return;
        }

        // Verify task exists and user has access
        const existing = await prisma.taskAssignment.findUnique({
            where: { id },
            select: { assigned_to_id: true, assigned_by_id: true, title: true },
        });

        if (!existing) {
            res.status(404).json({ success: false, error: 'Task not found' });
            return;
        }

        // Only the assigned employee or the creating lead can update status
        if (existing.assigned_to_id !== userId && existing.assigned_by_id !== userId) {
            res.status(403).json({ success: false, error: 'You do not have permission to update this task' });
            return;
        }

        const updatedTask = await prisma.taskAssignment.update({
            where: { id },
            data: { status },
            include: {
                documents: true,
                assigned_by: { select: { id: true, full_name: true } },
                assigned_to: { select: { id: true, full_name: true } },
            },
        });

        // Notify the other party about the status change
        const notifyUserId = userId === existing.assigned_to_id
            ? existing.assigned_by_id
            : existing.assigned_to_id;

        const statusLabels: Record<string, string> = {
            PENDING: 'Pending',
            IN_PROGRESS: 'In Progress',
            BLOCKED: 'Blocked',
            COMPLETED: 'Completed',
        };

        await createNotification(
            notifyUserId,
            NotificationType.TASK_UPDATED,
            'Task Status Updated',
            `Task "${existing.title}" status changed to ${statusLabels[status]}`,
            { taskId: id, status }
        );

        // Note: createNotification already sends real-time socket notification to the other party

        logger.info('Task status updated', { taskId: id, status, updatedBy: userId });

        res.json({
            success: true,
            message: 'Task status updated',
            data: { task: updatedTask },
        });
    } catch (error) {
        logger.error('Update task status error', { error: (error as Error).message });
        res.status(500).json({ success: false, error: 'Failed to update task status' });
    }
}

/**
 * DELETE /api/tasks/:id
 * Delete a task (LEAD only — the one who created it)
 */
export async function deleteTask(req: Request, res: Response): Promise<void> {
    try {
        const leadId = req.user?.userId;
        const { id } = req.params;

        if (!leadId) {
            res.status(401).json({ success: false, error: 'Unauthorized' });
            return;
        }

        // Verify task exists and was created by this lead
        const existing = await prisma.taskAssignment.findUnique({
            where: { id },
            include: { documents: true },
        });

        if (!existing) {
            res.status(404).json({ success: false, error: 'Task not found' });
            return;
        }
        if (existing.assigned_by_id !== leadId) {
            res.status(403).json({ success: false, error: 'You can only delete tasks you created' });
            return;
        }

        // Delete associated files from disk
        for (const doc of existing.documents) {
            try {
                const filePath = path.resolve(doc.file_path);
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            } catch (e) {
                logger.warn('Failed to delete task document file', { docId: doc.id, error: (e as Error).message });
            }
        }

        // Delete task (cascades to documents in DB)
        await prisma.taskAssignment.delete({ where: { id } });

        // Notify employee
        await createNotification(
            existing.assigned_to_id,
            NotificationType.TASK_UPDATED,
            'Task Removed',
            `Task "${existing.title}" has been removed by your team lead`,
            { taskId: id }
        );

        // Real-time update
        if (io) {
            io.to(`user:${existing.assigned_to_id}`).emit('task_deleted', { id });
        }

        logger.info('Task deleted', { taskId: id, deletedBy: leadId });

        res.json({
            success: true,
            message: 'Task deleted successfully',
        });
    } catch (error) {
        logger.error('Delete task error', { error: (error as Error).message });
        res.status(500).json({ success: false, error: 'Failed to delete task' });
    }
}

/**
 * GET /api/tasks/document/:id
 * Download a task document
 */
export async function downloadTaskDocument(req: Request, res: Response): Promise<void> {
    try {
        const userId = req.user?.userId;
        const { id } = req.params;

        if (!userId) {
            res.status(401).json({ success: false, error: 'Unauthorized' });
            return;
        }

        const doc = await prisma.taskDocument.findUnique({
            where: { id },
            include: {
                task: {
                    select: { assigned_to_id: true, assigned_by_id: true },
                },
            },
        });

        if (!doc) {
            res.status(404).json({ success: false, error: 'Document not found' });
            return;
        }

        // Access check: only the assigned employee or the creating lead (or admin)
        const userRole = req.user?.role;
        if (
            doc.task.assigned_to_id !== userId &&
            doc.task.assigned_by_id !== userId &&
            userRole !== 'ADMIN' &&
            userRole !== 'POSTGRES_SQL'
        ) {
            res.status(403).json({ success: false, error: 'Unauthorized access' });
            return;
        }

        const filePath = path.resolve(doc.file_path);
        if (!fs.existsSync(filePath)) {
            res.status(404).json({ success: false, error: 'File not found on server' });
            return;
        }

        res.download(filePath, doc.file_name);
    } catch (error) {
        logger.error('Download task document error', { error: (error as Error).message });
        res.status(500).json({ success: false, error: 'Failed to download document' });
    }
}

export default {
    createTask,
    getMyTasks,
    getCreatedTasks,
    getTasksForEmployee,
    updateTask,
    updateTaskStatus,
    deleteTask,
    downloadTaskDocument,
};
