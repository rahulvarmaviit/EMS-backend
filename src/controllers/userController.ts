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
      const leadTeams = await prisma.team.findMany({
        where: { lead_id: userId },
      });

      if (!leadTeams || leadTeams.length === 0) {
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

      whereClause.team_id = { in: leadTeams.map(t => t.id) };
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
          // @ts-ignore: Prisma generated type. `managed_teams` does exist.
          managed_teams: {
            select: { id: true, name: true },
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
        users: users.map((u: any) => ({
          id: u.id,
          employee_id: u.employee_id,
          mobile_number: u.mobile_number,
          full_name: u.full_name,
          role: u.role,
          team_id: u.team_id,
          team_name: u.team?.name || null,
          managed_teams: u.managed_teams || [],
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
          employee_id: user.employee_id,
          mobile_number: user.mobile_number,
          full_name: user.full_name,
          role: user.role,
          team_id: user.team_id,
          team_name: user.team?.name || null,
          team_lead_name: user.team?.lead?.full_name || null,
          // @ts-ignore: Prisma generated type error. `managed_teams` does exist.
          managed_teams: user.managed_teams?.map((t: any) => ({
            id: t.id,
            name: t.name,
          })) || [],
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
    const { team_id, team_ids, role, is_lead } = req.body;

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

    if (newRole === 'LEAD' && team_ids && Array.isArray(team_ids)) {
      // Multiple Team Lead logic (For new flutter app)
      await prisma.user.update({
        where: { id },
        // @ts-ignore: Prisma generated type error. `managed_teams` does exist.
        data: {
          role: newRole,
          managed_teams: {
            set: team_ids.map((tId: string) => ({ id: tId })),
          }
        },
      });

      // Update lead_id on the actual team records
      for (const tId of team_ids) {
        await prisma.team.update({
          where: { id: tId },
          data: { lead_id: id },
        });
      }
    } else {
      // Legacy / Single team logic
      await prisma.user.update({
        where: { id },
        data: {
          team_id: team_id || null, // Allow removing from team by passing null
          role: newRole
        },
      });

      if (team_id) {
        if (newRole === 'LEAD') {
          await prisma.team.update({
            where: { id: team_id },
            data: { lead_id: id },
          });
        } else {
          const currentTeam = await prisma.team.findUnique({ where: { id: team_id } });
          if (currentTeam?.lead_id === id) {
            await prisma.team.update({
              where: { id: team_id },
              data: { lead_id: null }
            });
          }
        }
      }
    }

    // Fetch updated user
    const updatedUser = await prisma.user.findUnique({
      where: { id },
      // @ts-ignore: Prisma generated type error. `managed_teams` does exist.
      include: {
        team: { select: { name: true } },
        managed_teams: { select: { name: true } }
      },
    });

    logger.info('User updated (assignTeam)', {
      userId: id,
      teamId: team_id,
      role: newRole,
      assignedBy: req.user?.userId,
    });

    // NOTIFICATIONS
    // @ts-ignore: Prisma generated type error. `team` does exist.
    if (team_id && updatedUser?.team) {
      // Assigned to a team
      await createNotification(
        id,
        NotificationType.TEAM_MEMBER_ASSIGNED,
        'Team Assignment',
        // @ts-ignore: Prisma generated type error. `team` does exist.
        `You have been assigned to team: ${updatedUser.team.name}`,
        // @ts-ignore: Prisma generated type error. `team` does exist.
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
          id: updatedUser?.id,
          full_name: updatedUser?.full_name,
          role: updatedUser?.role,
          team_id: updatedUser?.team_id,
          // @ts-ignore: Prisma generated type error. `team` does exist.
          team_name: updatedUser?.team?.name || null,
          // @ts-ignore: Prisma generated type error. `managed_teams` does exist.
          managed_teams: updatedUser?.managed_teams?.map((t: any) => ({
            id: t.id,
            name: t.name,
          })) || [],
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
      // @ts-ignore: Prisma generated type error. `managed_teams` does exist.
      include: {
        managed_teams: true, // Check if they lead a team
      },
    });

    if (!user) {
      res.status(404).json({
        success: false,
        error: 'User not found',
      });
      return;
    }

    // @ts-ignore: Prisma generated type error. `managed_teams` does exist.
    // If user is a Team Lead, unassign them from the team first
    // @ts-ignore: Prisma generated type error. `managed_teams` does exist.
    if (user.managed_teams && user.managed_teams.length > 0) {
      await prisma.team.updateMany({
        where: { lead_id: user.id },
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
      // @ts-ignore: Prisma generated type error. `managed_teams` does exist.
      wasTeamLead: user.managed_teams && user.managed_teams.length > 0,
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
    const { mobile_number, password, full_name, employee_id } = req.body;

    if (!mobile_number && !password && !full_name && !employee_id) {
      res.status(400).json({
        success: false,
        error: 'Either mobile_number, password, full_name, or employee_id must be provided',
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

    // Handle Employee ID Update
    if (employee_id) {
      if (employee_id.trim().length === 0) {
        res.status(400).json({
          success: false,
          error: 'Employee ID cannot be empty',
        });
        return;
      }
      
      // Check for uniqueness
      const existingUser = await prisma.user.findUnique({
        where: { employee_id: employee_id.trim() },
      });

       if (existingUser && existingUser.id !== id) {
        res.status(409).json({
          success: false,
          error: 'Employee ID already in use by another user',
        });
        return;
      }

      updateData.employee_id = employee_id.trim();
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

    // Handle Name Update
    if (full_name) {
      if (full_name.trim().length === 0) {
        res.status(400).json({
          success: false,
          error: 'Name cannot be empty',
        });
        return;
      }
      updateData.full_name = full_name.trim();
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
          employee_id: updatedUser.employee_id,
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
