// User Controller
// Purpose: User management operations (Admin/Lead access) using Prisma

import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { Role, NotificationType } from '@prisma/client';
import { createNotification } from '../services/notificationService';
import bcrypt from 'bcryptjs';

/**
 * GET /api/users
 * List all users (Admin sees all, Lead sees their team)
 */
export async function listUsers(req: Request, res: Response): Promise<void> {
  try {
    const userRole = req.user?.role;
    const userId = req.user?.userId;
    const { page = 1, limit = 50, team_id, role } = req.query;

    const pageNum = Math.max(1, parseInt(page as string, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10)));
    const skip = (pageNum - 1) * limitNum;

    // Build where clause
    // Exclude SUPER_ADMIN from all lists by default
    const whereClause: any = {
      is_active: true,
      role: { not: 'POSTGRES_SQL' }
    };

    // Lead can only see their team members
    if (userRole === 'LEAD') {
      const leadTeam = await prisma.team.findFirst({
        where: { lead_id: userId },
      });

      if (!leadTeam) {
        // Lead without a team sees no one
        res.json({
          success: true,
          data: {
            users: [],
            pagination: { page: 1, limit: limitNum, total: 0, totalPages: 0 },
          },
        });
        return;
      }

      whereClause.team_id = leadTeam.id;
    } else if (team_id) {
      // Admin can filter by team_id
      whereClause.team_id = team_id as string;
    }

    // Filter by role
    if (role) {
      if (role === 'POSTGRES_SQL') {
        // Do not allow listing super admins
        res.json({
          success: true,
          data: {
            users: [],
            pagination: { page: 1, limit: limitNum, total: 0, totalPages: 0 },
          },
        });
        return;
      }
      whereClause.role = role as Role;
    }

    // Get users with pagination
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where: whereClause,
        include: {
          team: {
            select: { name: true },
          },
        },
        orderBy: { full_name: 'asc' },
        take: limitNum,
        skip,
      }),
      prisma.user.count({ where: whereClause }),
    ]);

    res.json({
      success: true,
      data: {
        users: users.map(u => ({
          id: u.id,
          mobile_number: u.mobile_number,
          full_name: u.full_name,
          role: u.role,
          team_id: u.team_id,
          team_name: u.team?.name || null,
          is_active: u.is_active,
          created_at: u.created_at,
        })),
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      },
    });
  } catch (error) {
    logger.error('List users error', { error: (error as Error).message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch users',
    });
  }
}

/**
 * GET /api/users/:id
 * Get single user details
 */
export async function getUser(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        team: {
          include: {
            lead: {
              select: { full_name: true },
            },
          },
        },
      },
    });

    if (!user) {
      res.status(404).json({
        success: false,
        error: 'User not found',
      });
      return;
    }

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          mobile_number: user.mobile_number,
          full_name: user.full_name,
          role: user.role,
          team_id: user.team_id,
          team_name: user.team?.name || null,
          team_lead_name: user.team?.lead?.full_name || null,
          is_active: user.is_active,
          created_at: user.created_at,
        },
      },
    });
  } catch (error) {
    logger.error('Get user error', { error: (error as Error).message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user',
    });
  }
}

/**
 * PATCH /api/users/:id/assign-team
 * Assign user to a team (Admin only)
 */
export async function assignTeam(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { team_id, role, is_lead } = req.body;

    // Verify user exists
    const user = await prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      res.status(404).json({
        success: false,
        error: 'User not found',
      });
      return;
    }

    // Verify team exists (if assigning to a team)
    if (team_id) {
      const team = await prisma.team.findUnique({
        where: { id: team_id },
      });

      if (!team) {
        res.status(404).json({
          success: false,
          error: 'Team not found',
        });
        return;
      }
    }

    // Determine the new role
    let newRole = user.role;
    if (role) {
      // Explicit role update
      newRole = role;
    } else if (is_lead !== undefined) {
      // Legacy support/UI checkbox support
      newRole = is_lead ? 'LEAD' : 'EMPLOYEE';
    }

    // Validate role
    if (!['ADMIN', 'LEAD', 'EMPLOYEE'].includes(newRole)) {
      res.status(400).json({
        success: false,
        error: 'Invalid role',
      });
      return;
    }

    // Update user's team and role
    await prisma.user.update({
      where: { id },
      data: {
        team_id: team_id || null, // Allow removing from team by passing null
        role: newRole
      },
    });

    // Handle Team Lead logic
    if (team_id) {
      if (newRole === 'LEAD') {
        // Set this user as the lead of the team
        await prisma.team.update({
          where: { id: team_id },
          data: { lead_id: id },
        });
      } else {
        // If user was the lead but is no longer LEAD (or changed teams), 
        // we might need to unset the lead_id of the team... 
        // For simplicity, if we are NOT setting them as lead, we don't automatically unset the *current* lead of the team 
        // unless it WAS this user.
        const currentTeam = await prisma.team.findUnique({ where: { id: team_id } });
        if (currentTeam?.lead_id === id) {
          await prisma.team.update({
            where: { id: team_id },
            data: { lead_id: null }
          });
        }
      }
    }

    // Fetch updated user
    const updatedUser = await prisma.user.findUnique({
      where: { id },
      include: {
        team: { select: { name: true } },
      },
    });

    logger.info('User updated (assignTeam)', {
      userId: id,
      teamId: team_id,
      role: newRole,
      assignedBy: req.user?.userId,
    });

    // NOTIFICATIONS
    if (team_id && updatedUser?.team) {
      // Assigned to a team
      await createNotification(
        id,
        NotificationType.TEAM_MEMBER_ASSIGNED,
        'Team Assignment',
        `You have been assigned to team: ${updatedUser.team.name}`,
        { teamId: team_id, teamName: updatedUser.team.name, role: newRole }
      );
    } else if (!team_id && user.team_id) {
      // Removed from a team
      await createNotification(
        id,
        NotificationType.TEAM_MEMBER_ASSIGNED, // Or generic update
        'Team Removal',
        `You have been removed from your team`,
        { oldTeamId: user.team_id }
      );
    }

    res.json({
      success: true,
      message: 'User updated successfully',
      data: {
        user: {
          id: updatedUser!.id,
          full_name: updatedUser!.full_name,
          role: updatedUser!.role,
          team_id: updatedUser!.team_id,
          team_name: updatedUser!.team?.name || null,
        },
      },
    });
  } catch (error) {
    logger.error('Assign team error', { error: (error as Error).message });
    res.status(500).json({
      success: false,
      error: 'Failed to update user',
    });
  }
}

/**
 * DELETE /api/users/:id
 * Hard delete a user (Admin only)
 * WARNING: This will cascade delete all user data (Attendance, Leaves, etc.)
 */
export async function deleteUser(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    // Don't allow deleting yourself
    if (id === req.user?.userId) {
      res.status(400).json({
        success: false,
        error: 'You cannot delete your own account',
      });
      return;
    }

    // Check if user exists and is a team lead
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        managed_team: true, // Check if they lead a team
      },
    });

    if (!user) {
      res.status(404).json({
        success: false,
        error: 'User not found',
      });
      return;
    }

    // If user is a Team Lead, unassign them from the team first
    if (user.managed_team) {
      await prisma.team.update({
        where: { id: user.managed_team.id },
        data: { lead_id: null },
      });
    }

    // Hard delete user
    // The onDelete: Cascade in schema will handle related records (Attendance, etc.)
    await prisma.user.delete({
      where: { id },
    });

    logger.info('User permanently deleted', {
      userId: id,
      deletedBy: req.user?.userId,
      wasTeamLead: !!user.managed_team,
    });

    res.json({
      success: true,
      message: 'User and all related data deleted successfully',
    });
  } catch (error) {
    logger.error('Delete user error', { error: (error as Error).message });
    res.status(500).json({
      success: false,
      error: 'Failed to delete user',
    });
  }
}

/**
 * PATCH /api/users/:id/reset-credentials
 * Reset user password or mobile number (Admin only)
 */
export async function resetCredentials(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { mobile_number, password } = req.body;

    if (!mobile_number && !password) {
      res.status(400).json({
        success: false,
        error: 'Either mobile_number or password must be provided',
      });
      return;
    }

    // Verify user exists
    const user = await prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      res.status(404).json({
        success: false,
        error: 'User not found',
      });
      return;
    }

    const updateData: any = {};

    // Handle Mobile Number Update
    if (mobile_number) {
      // Check for uniqueness
      const existingUser = await prisma.user.findUnique({
        where: { mobile_number },
      });

      if (existingUser && existingUser.id !== id) {
        res.status(409).json({
          success: false,
          error: 'Mobile number already in use by another user',
        });
        return;
      }

      updateData.mobile_number = mobile_number;
    }

    // Handle Password Update
    if (password) {
      if (password.length < 6) {
        res.status(400).json({
          success: false,
          error: 'Password must be at least 6 characters',
        });
        return;
      }

      const salt = await bcrypt.genSalt(10);
      updateData.password_hash = await bcrypt.hash(password, salt);
    }

    // Update user
    const updatedUser = await prisma.user.update({
      where: { id },
      data: updateData,
    });

    logger.info('User credentials reset', {
      userId: id,
      resetBy: req.user?.userId,
      updatedFields: Object.keys(updateData),
    });

    res.json({
      success: true,
      message: 'User credentials updated successfully',
      data: {
        user: {
          id: updatedUser.id,
          mobile_number: updatedUser.mobile_number,
          full_name: updatedUser.full_name,
          role: updatedUser.role,
        },
      },
    });
  } catch (error) {
    logger.error('Reset credentials error', { error: (error as Error).message });
    res.status(500).json({
      success: false,
      error: 'Failed to update credentials',
    });
  }
}

export default { listUsers, getUser, assignTeam, deleteUser, resetCredentials };
