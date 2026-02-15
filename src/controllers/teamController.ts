// Team Controller
// Purpose: Team management operations (Admin access) using Prisma

import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { createNotification } from '../services/notificationService';
import { NotificationType } from '@prisma/client';

/**
 * GET /api/teams
 * List all teams with lead info
 */
export async function listTeams(req: Request, res: Response): Promise<void> {
  try {
    const teams = await prisma.team.findMany({
      include: {
        lead: {
          select: {
            id: true,
            full_name: true,
            mobile_number: true,
          },
        },
        _count: {
          select: { members: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    res.json({
      success: true,
      data: {
        teams: teams.map(t => ({
          id: t.id,
          name: t.name,
          lead_id: t.lead_id,
          lead_name: t.lead?.full_name || null,
          lead_mobile: t.lead?.mobile_number || null,
          member_count: t._count.members,
          created_at: t.created_at,
        })),
      },
    });
  } catch (error) {
    logger.error('List teams error', { error: (error as Error).message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch teams',
    });
  }
}

/**
 * POST /api/teams
 * Create a new team (Admin only)
 */
export async function createTeam(req: Request, res: Response): Promise<void> {
  try {
    const { name, lead_id } = req.body;

    // Validate required fields
    if (!name || name.trim().length === 0) {
      res.status(400).json({
        success: false,
        error: 'Team name is required',
      });
      return;
    }

    // Check if team name already exists
    const existingTeam = await prisma.team.findFirst({
      where: {
        name: { equals: name.trim(), mode: 'insensitive' },
      },
    });

    if (existingTeam) {
      res.status(409).json({
        success: false,
        error: 'A team with this name already exists',
      });
      return;
    }

    // Verify lead exists if provided
    if (lead_id) {
      const lead = await prisma.user.findFirst({
        where: { id: lead_id, is_active: true },
      });

      if (!lead) {
        res.status(404).json({
          success: false,
          error: 'Lead user not found',
        });
        return;
      }
    }

    // Create team
    const newTeam = await prisma.team.create({
      data: {
        name: name.trim(),
        lead_id: lead_id || null,
      },
    });

    // If lead assigned, update lead's role and team_id
    if (lead_id) {
      await prisma.user.update({
        where: { id: lead_id },
        data: { role: 'LEAD', team_id: newTeam.id },
      });
    }

    logger.info('Team created', {
      teamId: newTeam.id,
      teamName: newTeam.name,
      leadId: lead_id,
      createdBy: req.user?.userId,
    });

    // NOTIFICATIONS
    // Notify New Lead
    if (lead_id) {
      await createNotification(
        lead_id,
        NotificationType.TEAM_LEAD_ASSIGNED,
        'Team Lead Assignment',
        `You have been assigned as the Team Lead for ${newTeam.name}`,
        { teamId: newTeam.id, teamName: newTeam.name }
      );
    }

    res.status(201).json({
      success: true,
      message: 'Team created successfully',
      data: {
        team: newTeam,
      },
    });
  } catch (error) {
    logger.error('Create team error', { error: (error as Error).message });
    res.status(500).json({
      success: false,
      error: 'Failed to create team',
    });
  }
}

/**
 * GET /api/teams/:id
 * Get single team with members
 */
export async function getTeam(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    // Get team details with lead and members
    const team = await prisma.team.findUnique({
      where: { id },
      include: {
        lead: {
          select: {
            id: true,
            full_name: true,
            mobile_number: true,
          },
        },
        members: {
          where: { is_active: true },
          select: {
            id: true,
            full_name: true,
            mobile_number: true,
            role: true,
          },
          orderBy: [{ role: 'asc' }, { full_name: 'asc' }],
        },
      },
    });

    if (!team) {
      res.status(404).json({
        success: false,
        error: 'Team not found',
      });
      return;
    }

    res.json({
      success: true,
      data: {
        team: {
          id: team.id,
          name: team.name,
          lead_id: team.lead_id,
          lead_name: team.lead?.full_name || null,
          lead_mobile: team.lead?.mobile_number || null,
          created_at: team.created_at,
        },
        members: team.members,
      },
    });
  } catch (error) {
    logger.error('Get team error', { error: (error as Error).message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch team',
    });
  }
}

/**
 * PATCH /api/teams/:id
 * Update team (Admin only)
 */
export async function updateTeam(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { name, lead_id } = req.body;

    // Verify team exists
    const existingTeam = await prisma.team.findUnique({
      where: { id },
    });

    if (!existingTeam) {
      res.status(404).json({
        success: false,
        error: 'Team not found',
      });
      return;
    }

    const oldLeadId = existingTeam.lead_id;

    // Build update data
    const updateData: { name?: string; lead_id?: string | null } = {};

    if (name !== undefined) {
      updateData.name = name.trim();
    }

    if (lead_id !== undefined) {
      // Verify new lead exists
      if (lead_id) {
        const lead = await prisma.user.findFirst({
          where: { id: lead_id, is_active: true },
        });

        if (!lead) {
          res.status(404).json({
            success: false,
            error: 'Lead user not found',
          });
          return;
        }
      }
      updateData.lead_id = lead_id || null;
    }

    if (Object.keys(updateData).length === 0) {
      res.status(400).json({
        success: false,
        error: 'No fields to update',
      });
      return;
    }

    const updatedTeam = await prisma.team.update({
      where: { id },
      data: updateData,
    });

    // Update user roles if lead changed
    if (lead_id !== undefined && lead_id !== oldLeadId) {
      // Demote old lead to EMPLOYEE
      if (oldLeadId) {
        await prisma.user.update({
          where: { id: oldLeadId },
          data: { role: 'EMPLOYEE' },
        });
      }

      // Promote new lead
      if (lead_id) {
        await prisma.user.update({
          where: { id: lead_id },
          data: { role: 'LEAD', team_id: id },
        });
      }
    }

    logger.info('Team updated', {
      teamId: id,
      updatedBy: req.user?.userId,
    });

    // NOTIFICATIONS
    if (lead_id !== undefined && lead_id !== oldLeadId) {
      // Notify Old Lead
      if (oldLeadId) {
        await createNotification(
          oldLeadId,
          NotificationType.TEAM_LEAD_ASSIGNED, // Or a generic TEAM_UPDATE
          'Team Lead Role Removed',
          `You are no longer the Team Lead for ${existingTeam.name}`,
          { teamId: id, teamName: existingTeam.name }
        );
      }

      // Notify New Lead
      if (lead_id) {
        await createNotification(
          lead_id,
          NotificationType.TEAM_LEAD_ASSIGNED,
          'Team Lead Assignment',
          `You have been assigned as the Team Lead for ${existingTeam.name}`,
          { teamId: id, teamName: existingTeam.name }
        );
      }
    }

    res.json({
      success: true,
      message: 'Team updated successfully',
      data: {
        team: updatedTeam,
      },
    });
  } catch (error) {
    logger.error('Update team error', { error: (error as Error).message });
    res.status(500).json({
      success: false,
      error: 'Failed to update team',
    });
  }
}

/**
 * DELETE /api/teams/:id
 * Soft delete a team (Admin only)
 */
export async function deleteTeam(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    // Check if team has members
    const memberCount = await prisma.user.count({
      where: { team_id: id, is_active: true },
    });

    if (memberCount > 0) {
      res.status(400).json({
        success: false,
        error: 'Cannot delete team with active members. Reassign members first.',
      });
      return;
    }

    // Delete team (Prisma doesn't have soft delete by default, so we'll just delete)
    // If you need soft delete, add is_active field to Team model
    try {
      await prisma.team.delete({
        where: { id },
      });
    } catch (e) {
      res.status(404).json({
        success: false,
        error: 'Team not found',
      });
      return;
    }

    logger.info('Team deleted', {
      teamId: id,
      deletedBy: req.user?.userId,
    });

    res.json({
      success: true,
      message: 'Team deleted successfully',
    });
  } catch (error) {
    logger.error('Delete team error', { error: (error as Error).message });
    res.status(500).json({
      success: false,
      error: 'Failed to delete team',
    });
  }
}

export default { listTeams, createTeam, getTeam, updateTeam, deleteTeam };
