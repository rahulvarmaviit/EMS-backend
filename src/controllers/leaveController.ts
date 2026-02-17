
import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { notifyUsersByRole, notifyTeamLead, createNotification } from '../services/notificationService';
import { NotificationType } from '@prisma/client';

/**
 * POST /api/leaves
 * Apply for a new leave
 */
export async function createLeaveRequest(req: Request, res: Response): Promise<void> {
    try {
        const userId = req.user?.userId;
        const { start_date, end_date, reason } = req.body;

        if (!start_date || !end_date || !reason) {
            res.status(400).json({
                success: false,
                error: 'Start date, end date, and reason are required',
            });
            return;
        }

        const startDate = new Date(start_date);
        const endDate = new Date(end_date);

        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
            res.status(400).json({
                success: false,
                error: 'Invalid date format',
            });
            return;
        }

        if (endDate < startDate) {
            res.status(400).json({
                success: false,
                error: 'End date cannot be before start date',
            });
            return;
        }

        // Check for overlapping leaves
        const overlapping = await prisma.leaveRequest.findFirst({
            where: {
                user_id: userId,
                OR: [
                    {
                        start_date: { lte: endDate },
                        end_date: { gte: startDate },
                    },
                ],
                status: { not: 'REJECTED' },
            },
        });

        if (overlapping) {
            res.status(400).json({
                success: false,
                error: 'You already have a leave request for this period',
            });
            return;
        }

        const leave = await prisma.leaveRequest.create({
            data: {
                user_id: userId!,
                start_date: startDate,
                end_date: endDate,
                reason,
                status: 'PENDING',
            },
        });

        // Fetch user for notification details
        const user = await prisma.user.findUnique({ where: { id: userId } });
        const userName = user?.full_name || 'User';

        logger.info(`Leave request created by user ${userId}`);

        // NOTIFICATIONS
        // 1. Notify Admins
        if (user?.role !== 'ADMIN') {
            await notifyUsersByRole(
                'ADMIN',
                NotificationType.LEAVE_REQUEST,
                'New Leave Request',
                `${userName} requested leave from ${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()}`,
                { leaveId: leave.id, userId }
            );
        }

        // 2. Notify Team Lead
        if (user?.team_id) {
            await notifyTeamLead(
                user.team_id,
                NotificationType.LEAVE_REQUEST,
                'Team Member Leave Request',
                `${userName} requested leave`,
                { leaveId: leave.id, userId }
            );
        }

        res.status(201).json({
            success: true,
            message: 'Leave request submitted successfully',
            data: leave,
        });
    } catch (error) {
        logger.error('Create leave error', { error: (error as Error).message });
        res.status(500).json({
            success: false,
            error: 'Failed to submit leave request',
        });
    }
}

/**
 * GET /api/leaves/self
 * Get current user's leave history
 */
export async function getMyLeaves(req: Request, res: Response): Promise<void> {
    try {
        const userId = req.user?.userId;
        const { page = 1, limit = 20 } = req.query;

        const pageNum = Math.max(1, parseInt(page as string, 10));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10)));
        const skip = (pageNum - 1) * limitNum;

        const [leaves, total] = await Promise.all([
            prisma.leaveRequest.findMany({
                where: { user_id: userId },
                include: {
                    approved_by: { select: { id: true, full_name: true } },
                    rejected_by: { select: { id: true, full_name: true } },
                    revoked_by: { select: { id: true, full_name: true } },
                },
                orderBy: { created_at: 'desc' },
                take: limitNum,
                skip,
            }),
            prisma.leaveRequest.count({
                where: { user_id: userId },
            }),
        ]);

        res.json({
            success: true,
            data: {
                leaves,
                pagination: {
                    page: pageNum,
                    limit: limitNum,
                    total,
                    totalPages: Math.ceil(total / limitNum),
                },
            },
        });
    } catch (error) {
        logger.error('Get my leaves error', { error: (error as Error).message });
        res.status(500).json({
            success: false,
            error: 'Failed to fetch leave history',
        });
    }
}

/**
 * GET /api/leaves/team
 * Get team members' leave requests (Lead/Admin only)
 */
export async function getTeamLeaves(req: Request, res: Response): Promise<void> {
    try {
        const userId = req.user?.userId;
        const userRole = req.user?.role;
        const { status, page = 1, limit = 20 } = req.query;

        // Verify role
        if (userRole === 'EMPLOYEE') {
            res.status(403).json({
                success: false,
                error: 'Unauthorized access',
            });
            return;
        }

        // If Lead, find their team
        let teamId: string | undefined;
        if (userRole === 'LEAD') {
            const team = await prisma.team.findFirst({
                where: { lead_id: userId },
            });

            if (!team) {
                res.status(400).json({
                    success: false,
                    error: 'You are not assigned as a lead to any team',
                });
                return;
            }
            teamId = team.id;
        }

        // Build filter
        const whereClause: any = {};

        // For leads, filter by team
        if (teamId) {
            whereClause.user = { team_id: teamId };
        }

        if (status) {
            whereClause.status = status;
        }

        const pageNum = Math.max(1, parseInt(page as string, 10));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10)));
        const skip = (pageNum - 1) * limitNum;

        const [leaves, total] = await Promise.all([
            prisma.leaveRequest.findMany({
                where: whereClause,
                include: {
                    user: {
                        select: {
                            id: true,
                            full_name: true,
                            mobile_number: true,
                            team: { select: { name: true } }
                        }
                    },
                    approved_by: { select: { id: true, full_name: true } },
                    rejected_by: { select: { id: true, full_name: true } },
                    revoked_by: { select: { id: true, full_name: true } },
                },
                orderBy: { created_at: 'desc' },
                take: limitNum,
                skip,
            }),
            prisma.leaveRequest.count({ where: whereClause }),
        ]);

        res.json({
            success: true,
            data: {
                leaves,
                pagination: {
                    page: pageNum,
                    limit: limitNum,
                    total,
                    totalPages: Math.ceil(total / limitNum),
                },
            },
        });

    } catch (error) {
        logger.error('Get team leaves error', { error: (error as Error).message });
        res.status(500).json({
            success: false,
            error: 'Failed to fetch team leaves',
        });
    }
}

/**
 * GET /api/leaves/user/:userId
 * Get leave history for a specific user (Admin/Lead only)
 */
export async function getUserLeaves(req: Request, res: Response): Promise<void> {
    try {
        const { userId } = req.params;
        const { page = 1, limit = 20 } = req.query;
        const requesterRole = req.user?.role;
        const requesterId = req.user?.userId;

        // Verify permissions
        if (requesterRole !== 'POSTGRES_SQL' && requesterRole !== 'ADMIN' && requesterRole !== 'LEAD') {
            res.status(403).json({
                success: false,
                error: 'Unauthorized access',
            });
            return;
        }

        // If Lead, verify the target user is in their team
        if (requesterRole === 'LEAD') {
            const user = await prisma.user.findUnique({
                where: { id: userId },
                include: { team: true },
            });

            if (!user || user.team?.lead_id !== requesterId) {
                res.status(403).json({
                    success: false,
                    error: 'You can only view leaves for your team members',
                });
                return;
            }
        }

        const pageNum = Math.max(1, parseInt(page as string, 10));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10)));
        const skip = (pageNum - 1) * limitNum;

        const [leaves, total] = await Promise.all([
            prisma.leaveRequest.findMany({
                where: { user_id: userId },
                orderBy: { created_at: 'desc' },
                take: limitNum,
                skip,
            }),
            prisma.leaveRequest.count({
                where: { user_id: userId },
            }),
        ]);

        res.json({
            success: true,
            data: {
                leaves,
                pagination: {
                    page: pageNum,
                    limit: limitNum,
                    total,
                    totalPages: Math.ceil(total / limitNum),
                },
            },
        });
    } catch (error) {
        logger.error('Get user leaves error', { error: (error as Error).message });
        res.status(500).json({
            success: false,
            error: 'Failed to fetch user leaves',
        });
    }
}

/**
 * PATCH /api/leaves/:id/status
 * Approve or Reject a leave request (Admin/Lead only)
 */
export async function updateLeaveStatus(req: Request, res: Response): Promise<void> {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const requesterRole = req.user?.role;
        const requesterId = req.user?.userId;

        if (!['APPROVED', 'REJECTED'].includes(status)) {
            res.status(400).json({
                success: false,
                error: 'Invalid status. Must be APPROVED or REJECTED',
            });
            return;
        }

        // Verify permissions
        if (requesterRole !== 'POSTGRES_SQL' && requesterRole !== 'ADMIN' && requesterRole !== 'LEAD') {
            res.status(403).json({
                success: false,
                error: 'Unauthorized access',
            });
            return;
        }

        const leave = await prisma.leaveRequest.findUnique({
            where: { id },
            include: { user: true }
        });

        if (!leave) {
            res.status(404).json({
                success: false,
                error: 'Leave request not found',
            });
            return;
        }

        // If Lead, verify the user is in their team
        // Note: Lead might be approving their OWN leave? Typically Leads can't approve their own.
        // Let's assume Leads approve their team members.
        if (requesterRole === 'LEAD') {
            const user = await prisma.user.findUnique({
                where: { id: leave.user_id },
                include: { team: true },
            });

            if (!user || user.team?.lead_id !== requesterId) {
                res.status(403).json({
                    success: false,
                    error: 'You can only manage leaves for your team members',
                });
                return;
            }
        }

        const updateData: any = { status };
        if (status === 'APPROVED') {
            updateData.approved_by_id = requesterId;
        } else if (status === 'REJECTED') {
            updateData.rejected_by_id = requesterId;
        }

        const updatedLeave = await prisma.leaveRequest.update({
            where: { id },
            data: updateData,
            include: {
                approved_by: { select: { id: true, full_name: true } },
                rejected_by: { select: { id: true, full_name: true } },
            },
        });

        logger.info('Leave status updated', {
            leaveId: id,
            status,
            updatedBy: requesterId
        });

        // NOTIFICATIONS
        // Notify Employee
        const notificationType = status === 'APPROVED' ? NotificationType.LEAVE_APPROVED : NotificationType.LEAVE_REJECTED;
        const title = status === 'APPROVED' ? 'Leave Approved' : 'Leave Rejected';
        const message = status === 'APPROVED'
            ? `Your leave request was approved.`
            : `Your leave request was rejected.`;

        await createNotification(
            leave.user_id,
            notificationType,
            title,
            message,
            { leaveId: leave.id, status }
        );

        res.json({
            success: true,
            message: `Leave request ${status.toLowerCase()}`,
            data: updatedLeave,
        });

    } catch (error) {
        logger.error('Update leave status error', { error: (error as Error).message });
        res.status(500).json({
            success: false,
            error: 'Failed to update leave status',
        });
    }
}

/**
 * PUT /api/leaves/:id/revoke
 * Revoke an approved leave request (Admin/Lead only)
 */
export async function revokeLeave(req: Request, res: Response): Promise<void> {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        const requesterRole = req.user?.role;
        const requesterId = req.user?.userId;

        if (!reason || reason.trim() === '') {
            res.status(400).json({
                success: false,
                error: 'Revocation reason is required',
            });
            return;
        }

        // Verify permissions
        if (requesterRole !== 'POSTGRES_SQL' && requesterRole !== 'ADMIN' && requesterRole !== 'LEAD') {
            res.status(403).json({
                success: false,
                error: 'Unauthorized access',
            });
            return;
        }

        const leave = await prisma.leaveRequest.findUnique({
            where: { id },
            include: { user: true }
        });

        if (!leave) {
            res.status(404).json({
                success: false,
                error: 'Leave request not found',
            });
            return;
        }

        if (leave.status !== 'APPROVED') {
            res.status(400).json({
                success: false,
                error: 'Only approved leaves can be revoked',
            });
            return;
        }

        // If Lead, verify the user is in their team
        if (requesterRole === 'LEAD') {
            const user = await prisma.user.findUnique({
                where: { id: leave.user_id },
                include: { team: true },
            });

            if (!user || user.team?.lead_id !== requesterId) {
                res.status(403).json({
                    success: false,
                    error: 'You can only revoke leaves for your team members',
                });
                return;
            }
        }

        const updatedLeave = await prisma.leaveRequest.update({
            where: { id },
            data: {
                status: 'REVOKED',
                revoked_by_id: requesterId,
                revocation_reason: reason.trim(),
            },
            include: {
                approved_by: { select: { id: true, full_name: true } },
                revoked_by: { select: { id: true, full_name: true } },
            },
        });

        logger.info('Leave revoked', {
            leaveId: id,
            revokedBy: requesterId,
            reason: reason.trim()
        });

        // NOTIFICATIONS
        // Notify Employee
        await createNotification(
            leave.user_id,
            NotificationType.LEAVE_REVOKED,
            'Leave Revoked',
            `Your approved leave has been revoked. Reason: ${reason.trim()}`,
            { leaveId: leave.id, reason: reason.trim() }
        );

        res.json({
            success: true,
            message: 'Leave request revoked successfully',
            data: updatedLeave,
        });

    } catch (error) {
        logger.error('Revoke leave error', { error: (error as Error).message });
        res.status(500).json({
            success: false,
            error: 'Failed to revoke leave',
        });
    }
}

export default { createLeaveRequest, getMyLeaves, getTeamLeaves, getUserLeaves, updateLeaveStatus, revokeLeave };
