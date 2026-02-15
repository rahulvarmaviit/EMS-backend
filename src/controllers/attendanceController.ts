// Attendance Controller
// Purpose: Handle check-in, check-out, and attendance history using Prisma

import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { isWithinGeofence, validateCoordinates, GeoLocation } from '../services/geoService';
import { logger } from '../utils/logger';
import config from '../config/env';
import { notifyUsersByRole, notifyTeamLead } from '../services/notificationService';
import { NotificationType } from '@prisma/client';

// Helper to get today's date at UTC midnight (for DATE column compatibility)
function getUtcMidnight(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

/**
 * POST /api/attendance/check-in
 * Record user check-in with GPS validation
 */
export async function checkIn(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    const { latitude, longitude } = req.body;
    const userRole = req.user?.role;

    // Validate coordinates
    if (!validateCoordinates(latitude, longitude)) {
      res.status(400).json({
        success: false,
        error: 'Invalid GPS coordinates. Please enable location services.',
      });
      return;
    }

    // Check if already checked in today (use UTC midnight for DATE column)
    const today = getUtcMidnight();
    console.log('Check-in: Today UTC midnight =', today.toISOString());

    const existingAttendance = await prisma.attendance.findFirst({
      where: {
        user_id: userId,
        date: today,
      },
    });

    if (existingAttendance) {
      res.status(400).json({
        success: false,
        error: 'You have already checked in today',
        data: {
          check_in_time: existingAttendance.check_in_time,
        },
      });
      return;
    }

    // Get all active office locations
    const locations = await prisma.location.findMany({
      where: { is_active: true },
    });

    if (locations.length === 0) {
      res.status(400).json({
        success: false,
        error: 'No office locations configured. Contact admin.',
      });
      return;
    }

    // Server-side geofence validation (never trust client)
    const geoLocations: GeoLocation[] = locations.map((loc: { id: string; name: string; latitude: any; longitude: any; radius_meters: number }) => ({
      id: loc.id,
      name: loc.name,
      latitude: Number(loc.latitude),
      longitude: Number(loc.longitude),
      radius_meters: loc.radius_meters,
    }));

    let matchingLocation = isWithinGeofence(latitude, longitude, geoLocations);

    // DEBUG: Skip geofence check if enabled in config
    if (config.SKIP_GEOFENCE && !matchingLocation) {
      logger.info('Skipping geofence check (dev mode)', { userId });
      matchingLocation = geoLocations[0] || {
        id: 'debug-loc',
        name: 'Debug Location (Geofence Disabled)',
        latitude: 0,
        longitude: 0,
        radius_meters: 1000,
      };
    }

    if (!matchingLocation) {
      logger.attendance('geo_rejected', userId!, {
        latitude,
        longitude,
        nearestLocations: geoLocations.map(l => l.name),
      });

      res.status(400).json({
        success: false,
        error: 'You are not within any office location. Please move closer to check in.',
      });
      return;
    }

    // Determine status (on-time or late)
    const now = new Date();
    const checkInHour = now.getHours();
    const checkInMinutes = now.getMinutes();

    // Late threshold: After 9:15 AM (configurable)
    let status: 'PRESENT' | 'LATE' = 'PRESENT';
    if (checkInHour > 9 || (checkInHour === 9 && checkInMinutes > config.LATE_THRESHOLD_MINUTES)) {
      status = 'LATE';
    }

    // Record check-in
    const attendance = await prisma.attendance.create({
      data: {
        user_id: userId!,
        date: today,
        check_in_time: now,
        check_in_lat: latitude,
        check_in_long: longitude,
        status,
      },
    });

    // Fetch user details for notification
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const userName = user?.full_name || 'User';

    logger.attendance('check_in', userId!, {
      location: matchingLocation.name,
      status,
      coordinates: { latitude, longitude },
    });

    // NOTIFICATIONS
    // 1. Notify Admins
    if (userRole !== 'ADMIN') {
      await notifyUsersByRole(
        'ADMIN',
        NotificationType.ATTENDANCE_CHECKIN,
        'Attendance Check-in',
        `${userName} checked in at ${matchingLocation.name}`,
        { userId, attendanceId: attendance.id }
      );
    }

    // 2. Notify Team Lead
    if (user?.team_id) {
      await notifyTeamLead(
        user.team_id,
        NotificationType.ATTENDANCE_CHECKIN,
        'Team Member Check-in',
        `${userName} checked in`,
        { userId, attendanceId: attendance.id }
      );
    }

    res.status(201).json({
      success: true,
      message: `Checked in at ${matchingLocation.name}`,
      data: {
        attendance: {
          id: attendance.id,
          date: attendance.date,
          check_in_time: attendance.check_in_time,
          status: attendance.status,
        },
        location: matchingLocation.name,
      },
    });
  } catch (error) {
    logger.error('Check-in error', { error: (error as Error).message });
    res.status(500).json({
      success: false,
      error: 'Check-in failed. Please try again.',
    });
  }
}

/**
 * POST /api/attendance/check-out
 * Record user check-out with GPS validation
 */
export async function checkOut(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    const { latitude, longitude, work_done, project_name, meetings, todo_updates, notes } = req.body;
    const userRole = req.user?.role;

    // Validate coordinates
    if (!validateCoordinates(latitude, longitude)) {
      res.status(400).json({
        success: false,
        error: 'Invalid GPS coordinates. Please enable location services.',
      });
      return;
    }

    // Find today's check-in record (use UTC midnight for DATE column)
    const today = getUtcMidnight();
    console.log('Check-out: Today UTC midnight =', today.toISOString());

    const existingAttendance = await prisma.attendance.findFirst({
      where: {
        user_id: userId,
        date: today,
      },
    });

    if (!existingAttendance) {
      res.status(400).json({
        success: false,
        error: 'You have not checked in today. Please check in first.',
      });
      return;
    }

    if (existingAttendance.check_out_time) {
      res.status(400).json({
        success: false,
        error: 'You have already checked out today',
        data: {
          check_out_time: existingAttendance.check_out_time,
        },
      });
      return;
    }

    // Calculate work hours and update status if needed
    const checkInTime = new Date(existingAttendance.check_in_time);
    const checkOutTime = new Date();
    const hoursWorked = (checkOutTime.getTime() - checkInTime.getTime()) / (1000 * 60 * 60);

    let status = existingAttendance.status;
    if (hoursWorked < config.HALF_DAY_HOURS) {
      status = 'HALF_DAY';
    }

    // Update attendance record
    const updatedAttendance = await prisma.attendance.update({
      where: { id: existingAttendance.id },
      data: {
        check_out_time: checkOutTime,
        check_out_lat: latitude,
        check_out_long: longitude,
        work_done,
        project_name,
        meetings,
        todo_updates,
        notes,
        status,
      },
    });

    // Fetch user details for notification
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const userName = user?.full_name || 'User';

    logger.attendance('check_out', userId!, {
      hoursWorked: hoursWorked.toFixed(2),
      status,
    });

    // NOTIFICATIONS
    // 1. Notify Admins
    if (userRole !== 'ADMIN') {
      await notifyUsersByRole(
        'ADMIN',
        NotificationType.ATTENDANCE_CHECKOUT,
        'Attendance Check-out',
        `${userName} checked out. Worked: ${hoursWorked.toFixed(1)} hrs.`,
        { userId, attendanceId: updatedAttendance.id }
      );
    }

    // 2. Notify Team Lead
    if (user?.team_id) {
      await notifyTeamLead(
        user.team_id,
        NotificationType.ATTENDANCE_CHECKOUT,
        'Team Member Check-out',
        `${userName} checked out`,
        { userId, attendanceId: updatedAttendance.id }
      );
    }

    res.json({
      success: true,
      message: 'Checked out successfully',
      data: {
        attendance: {
          id: updatedAttendance.id,
          date: updatedAttendance.date,
          check_in_time: updatedAttendance.check_in_time,
          check_out_time: updatedAttendance.check_out_time,
          status: updatedAttendance.status,
        },
        hoursWorked: hoursWorked.toFixed(2),
      },
    });
  } catch (error) {
    logger.error('Check-out error', { error: (error as Error).message });
    res.status(500).json({
      success: false,
      error: 'Check-out failed. Please try again.',
    });
  }
}


/**
 * GET /api/attendance/self
 * Get current user's attendance history
 */
export async function getSelfAttendance(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    const { page = 1, limit = 30 } = req.query;

    const pageNum = Math.max(1, parseInt(page as string, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10)));
    const skip = (pageNum - 1) * limitNum;

    // Get attendance records with pagination
    const [attendance, total] = await Promise.all([
      prisma.attendance.findMany({
        where: { user_id: userId },
        orderBy: { date: 'desc' },
        take: limitNum,
        skip,
      }),
      prisma.attendance.count({
        where: { user_id: userId },
      }),
    ]);

    res.json({
      success: true,
      data: {
        attendance: attendance.map((a: { id: string; date: Date; check_in_time: Date; check_out_time: Date | null; status: string }) => ({
          id: a.id,
          date: a.date.toISOString().split('T')[0],
          check_in_time: a.check_in_time,
          check_out_time: a.check_out_time,
          status: a.status,
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
    logger.error('Get self attendance error', { error: (error as Error).message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch attendance history',
    });
  }
}

/**
 * GET /api/attendance/team/:teamId
 * Get team attendance (Lead/Admin only)
 */
export async function getTeamAttendance(req: Request, res: Response): Promise<void> {
  try {
    const { teamId } = req.params;
    const { date, page = 1, limit = 50 } = req.query;
    const userRole = req.user?.role;
    const userId = req.user?.userId;

    // If Lead, verify they are the lead of this team
    if (userRole === 'LEAD') {
      const team = await prisma.team.findFirst({
        where: {
          id: teamId,
          lead_id: userId,
        },
      });

      if (!team) {
        res.status(403).json({
          success: false,
          error: 'You can only view attendance for your own team',
        });
        return;
      }
    }

    const pageNum = Math.max(1, parseInt(page as string, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10)));
    const skip = (pageNum - 1) * limitNum;

    // Build where clause
    const whereClause: any = {
      user: { team_id: teamId },
    };

    if (date) {
      // Parse date string (YYYY-MM-DD)
      const inputDate = new Date(date as string);

      // Create UTC midnight date (matching checkIn logic)
      const formattedDate = new Date(Date.UTC(
        inputDate.getFullYear(),
        inputDate.getMonth(),
        inputDate.getDate()
      ));

      whereClause.date = formattedDate;
    }

    // Get team members' attendance
    const [attendance, total] = await Promise.all([
      prisma.attendance.findMany({
        where: whereClause,
        include: {
          user: {
            select: {
              id: true,
              full_name: true,
              mobile_number: true,
            },
          },
        },
        orderBy: { date: 'desc' },
        take: limitNum,
        skip,
      }),
      prisma.attendance.count({ where: whereClause }),
    ]);

    res.json({
      success: true,
      data: {
        attendance: attendance.map((a: { id: string; date: Date; check_in_time: Date; check_out_time: Date | null; status: string; user: { id: string; full_name: string; mobile_number: string } }) => ({
          id: a.id,
          date: a.date.toISOString().split('T')[0],
          check_in_time: a.check_in_time,
          check_out_time: a.check_out_time,
          status: a.status,
          user_id: a.user.id,
          full_name: a.user.full_name,
          mobile_number: a.user.mobile_number,
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
    logger.error('Get team attendance error', { error: (error as Error).message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch team attendance',
    });
  }
}

/**
 * GET /api/attendance/user/:userId
 * Get attendance history for a specific user (Admin/Lead only)
 */
export async function getUserAttendance(req: Request, res: Response): Promise<void> {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 30 } = req.query;
    const requesterRole = req.user?.role;
    const requesterId = req.user?.userId;

    // Verify permissions
    if (requesterRole !== 'ADMIN' && requesterRole !== 'LEAD') {
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
          error: 'You can only view attendance for your team members',
        });
        return;
      }
    }

    const pageNum = Math.max(1, parseInt(page as string, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10)));
    const skip = (pageNum - 1) * limitNum;

    // Get attendance records
    const [attendance, total] = await Promise.all([
      prisma.attendance.findMany({
        where: { user_id: userId },
        orderBy: { date: 'desc' },
        take: limitNum,
        skip,
      }),
      prisma.attendance.count({
        where: { user_id: userId },
      }),
    ]);

    res.json({
      success: true,
      data: {
        attendance: attendance.map((a: any) => ({
          id: a.id,
          date: a.date.toISOString().split('T')[0],
          check_in_time: a.check_in_time,
          check_out_time: a.check_out_time,
          status: a.status,
          work_done: a.work_done,
          project_name: a.project_name,
          meetings: a.meetings,
          todo_updates: a.todo_updates,
          notes: a.notes,
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
    logger.error('Get user attendance error', { error: (error as Error).message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user attendance',
    });
  }
}

export default { checkIn, checkOut, getSelfAttendance, getTeamAttendance, getUserAttendance };
