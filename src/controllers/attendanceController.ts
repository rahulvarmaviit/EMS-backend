// Attendance Controller
// Purpose: Handle check-in, check-out, and attendance history using Prisma

import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { isWithinGeofence, validateCoordinates, GeoLocation } from '../services/geoService';
import { logger } from '../utils/logger';
import config from '../config/env';
import { notifyUsersByRole, notifyTeamLead } from '../services/notificationService';
import { NotificationType, BreakType } from '@prisma/client';

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

    // Determine status based on office timing rules
    const now = new Date();
    const checkInHour = now.getHours();
    const checkInMinutes = now.getMinutes();

    // Office starts at OFFICE_START_HOUR (default 10 AM)
    // LATE after OFFICE_START_HOUR + LATE_THRESHOLD_MINUTES (default 11 AM)
    // HALF_DAY after HALF_DAY_HOUR (default 12 PM)
    const lateAfterHour = config.OFFICE_START_HOUR + Math.floor(config.LATE_THRESHOLD_MINUTES / 60);
    const lateAfterMinutes = config.LATE_THRESHOLD_MINUTES % 60;

    let status: 'PRESENT' | 'LATE' | 'HALF_DAY' = 'PRESENT';
    if (checkInHour > config.HALF_DAY_HOUR || (checkInHour === config.HALF_DAY_HOUR && checkInMinutes > 0)) {
      status = 'HALF_DAY';
    } else if (checkInHour > lateAfterHour || (checkInHour === lateAfterHour && checkInMinutes > lateAfterMinutes)) {
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

    // Block checkout if user has an active break
    const attendanceWithBreaks = await prisma.attendance.findFirst({
      where: { id: existingAttendance.id },
      include: { breaks: true },
    });
    if (attendanceWithBreaks) {
      const activeBreak = attendanceWithBreaks.breaks.find((b: any) => !b.end_time);
      if (activeBreak) {
        res.status(400).json({
          success: false,
          error: `You are currently on a ${(activeBreak as any).type} break. Please end your break before checking out.`,
        });
        return;
      }
    }

    // Calculate work hours and update status if needed
    const checkInTime = new Date(existingAttendance.check_in_time);
    const checkOutTime = new Date();
    const hoursWorked = (checkOutTime.getTime() - checkInTime.getTime()) / (1000 * 60 * 60);
    const checkOutHour = checkOutTime.getHours();

    let status = existingAttendance.status;
    // HALF_DAY if checking out before HALF_DAY_HOUR (default 12 PM)
    if (checkOutHour < config.HALF_DAY_HOUR) {
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
        include: { breaks: { orderBy: { start_time: 'asc' } } },
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
          breaks: (a.breaks || []).map((b: any) => ({
            id: b.id,
            type: b.type,
            duration_min: b.duration_min,
            start_time: b.start_time,
            end_time: b.end_time,
          })),
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
        attendance: attendance.map((a: { id: string; date: Date; check_in_time: Date; check_out_time: Date | null; status: string; user: { id: string; full_name: string; mobile_number: string | null } }) => ({
          id: a.id,
          date: a.date.toISOString().split('T')[0],
          check_in_time: a.check_in_time,
          check_out_time: a.check_out_time,
          status: a.status,
          user_id: a.user.id,
          full_name: a.user.full_name,
          mobile_number: a.user.mobile_number || '',
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
        include: { breaks: true },
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
          breaks: a.breaks, // Include breaks
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

/**
 * POST /api/attendance/break/start
 * Start a break for the current user
 */
export async function startBreak(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    const { type } = req.body; // WALKING, TEA, LUNCH

    // Validate break type
    const validTypes: BreakType[] = ['WALKING', 'TEA', 'LUNCH'];
    if (!type || !validTypes.includes(type)) {
      res.status(400).json({
        success: false,
        error: 'Invalid break type. Must be WALKING, TEA, or LUNCH.',
      });
      return;
    }

    // Determine duration
    const durationMap: Record<BreakType, number> = {
      WALKING: 5,
      TEA: 15,
      LUNCH: 60,
    };
    const durationMin = durationMap[type as BreakType];

    // Find today's check-in
    const today = getUtcMidnight();
    const attendance = await prisma.attendance.findFirst({
      where: {
        user_id: userId,
        date: today,
      },
      include: { breaks: true },
    });

    if (!attendance) {
      res.status(400).json({
        success: false,
        error: 'You have not checked in today.',
      });
      return;
    }

    if (attendance.check_out_time) {
      res.status(400).json({
        success: false,
        error: 'You have already checked out today.',
      });
      return;
    }

    // Check for active break
    const activeBreak = attendance.breaks.find((b: any) => !b.end_time);
    if (activeBreak) {
      res.status(400).json({
        success: false,
        error: 'You already have an active break. Please end it first.',
      });
      return;
    }

    // Lunch can only be taken once per day
    if (type === 'LUNCH') {
      const lunchTaken = attendance.breaks.some((b: any) => b.type === 'LUNCH');
      if (lunchTaken) {
        res.status(400).json({
          success: false,
          error: 'Lunch break already taken today.',
        });
        return;
      }
    }

    // Create break record
    const breakRecord = await prisma.break.create({
      data: {
        type: type as BreakType,
        duration_min: durationMin,
        attendance_id: attendance.id,
      },
    });

    logger.info('Break started', { userId, type, durationMin, breakId: breakRecord.id });

    res.status(201).json({
      success: true,
      message: `${type} break started (${durationMin} min)`,
      data: {
        break: {
          id: breakRecord.id,
          type: breakRecord.type,
          duration_min: breakRecord.duration_min,
          start_time: breakRecord.start_time,
          end_time: breakRecord.end_time,
        },
      },
    });
  } catch (error) {
    logger.error('Start break error', { error: (error as Error).message });
    res.status(500).json({
      success: false,
      error: 'Failed to start break.',
    });
  }
}

/**
 * POST /api/attendance/break/end
 * End the current active break
 */
export async function endBreak(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;

    // Find today's check-in
    const today = getUtcMidnight();
    const attendance = await prisma.attendance.findFirst({
      where: {
        user_id: userId,
        date: today,
      },
      include: { breaks: true },
    });

    if (!attendance) {
      res.status(400).json({
        success: false,
        error: 'You have not checked in today.',
      });
      return;
    }

    // Find active break
    const activeBreak = attendance.breaks.find((b: any) => !b.end_time);
    if (!activeBreak) {
      res.status(400).json({
        success: false,
        error: 'No active break to end.',
      });
      return;
    }

    // End the break
    const updatedBreak = await prisma.break.update({
      where: { id: activeBreak.id },
      data: { end_time: new Date() },
    });

    logger.info('Break ended', { userId, breakId: activeBreak.id, type: activeBreak.type });

    res.json({
      success: true,
      message: 'Break ended successfully',
      data: {
        break: {
          id: updatedBreak.id,
          type: updatedBreak.type,
          duration_min: updatedBreak.duration_min,
          start_time: updatedBreak.start_time,
          end_time: updatedBreak.end_time,
        },
      },
    });
  } catch (error) {
    logger.error('End break error', { error: (error as Error).message });
    res.status(500).json({
      success: false,
      error: 'Failed to end break.',
    });
  }
}

/**
 * GET /api/attendance/breaks/:attendanceId
 * Get all breaks for a specific attendance record (Admin/Lead)
 */
export async function getBreaks(req: Request, res: Response): Promise<void> {
  try {
    const { attendanceId } = req.params;

    const breaks = await prisma.break.findMany({
      where: { attendance_id: attendanceId },
      orderBy: { start_time: 'asc' },
    });

    res.json({
      success: true,
      data: {
        breaks: breaks.map((b: any) => ({
          id: b.id,
          type: b.type,
          duration_min: b.duration_min,
          start_time: b.start_time,
          end_time: b.end_time,
        })),
      },
    });
  } catch (error) {
    logger.error('Get breaks error', { error: (error as Error).message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch breaks.',
    });
  }
}

export default { checkIn, checkOut, getSelfAttendance, getTeamAttendance, getUserAttendance, startBreak, endBreak, getBreaks };
