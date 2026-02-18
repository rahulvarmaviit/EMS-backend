// Authentication Controller
// Purpose: Handle login, registration, and token generation using Prisma

import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../config/database';
import { generateToken } from '../middlewares/auth';
import { logger } from '../utils/logger';
import { notifyUsersByRole, notifyTeamLead } from '../services/notificationService';
import { NotificationType } from '@prisma/client';

/**
 * POST /api/auth/login
 * Authenticate user with employee ID and password
 * Returns JWT token and user info on success
 */
export async function login(req: Request, res: Response): Promise<void> {
  try {
    const { employee_id, password } = req.body;

    // Validate required fields
    if (!employee_id || !password) {
      res.status(400).json({
        success: false,
        error: 'Employee ID and password are required',
      });
      return;
    }

    // Find user by employee_id
    const user = await prisma.user.findUnique({
      where: { employee_id },
      include: { team: true },
    });

    if (!user) {
      logger.auth('failed_login', undefined, { reason: 'user_not_found', employee_id });
      res.status(401).json({
        success: false,
        error: "Invalid Employee ID or password.",
      });
      return;
    }

    // Check if user is active
    if (!user.is_active) {
      logger.auth('failed_login', user.id, { reason: 'account_deactivated' });
      res.status(401).json({
        success: false,
        error: 'Your account has been deactivated. Contact admin.',
      });
      return;
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      logger.auth('failed_login', user.id, { reason: 'invalid_password' });
      res.status(401).json({
        success: false,
        error: 'Invalid Employee ID or password.',
      });
      return;
    }

    // Get device info and IP address
    const device_name = req.body.device_name || 'Unknown Device';
    const device_id = req.body.device_id; // Unique Device ID from App
    const ip_address = req.ip || req.headers['x-forwarded-for']?.toString().split(',')[0] || 'Unknown';
    const user_agent = req.headers['user-agent'] || null;

    // DEVICE BINDING LOGIC
    // Skip device binding for POSTGRES_SQL (super admin) - allow login from any device
    if (device_id && user.role !== 'POSTGRES_SQL' as any) {
      if (!user.device_id) {
        // First time login with a device (or legacy user), bind account to this device
        await prisma.user.update({
          where: { id: user.id },
          data: { device_id },
        });
        logger.auth('device_bind', user.id, { device_id, device_name });
      } else if (user.device_id !== device_id) {
        // Mismatch - Block Login
        logger.auth('failed_login', user.id, { reason: 'device_mismatch', stored: user.device_id, attempt: device_id });
        res.status(403).json({
          success: false,
          error: 'This account is bound to another device. Please login from your registered device.',
        });
        return;
      }
    }

    // Record login history
    await prisma.loginHistory.create({
      data: {
        user_id: user.id,
        device_name,
        ip_address,
        user_agent,
      },
    });

    // Generate JWT token
    const token = generateToken({
      userId: user.id,
      employee_id: user.employee_id,
      mobile_number: user.mobile_number || '',
      role: user.role as any,
    });

    logger.auth('login', user.id, { role: user.role, device_name, ip_address });

    // NOTIFICATIONS
    // 1. Notify Admins
    if (user.role !== 'ADMIN' && user.role !== 'POSTGRES_SQL' as any) { // Admin and POSTGRES_SQL don't need to notify admins they logged in
      await notifyUsersByRole(
        'ADMIN',
        NotificationType.USER_LOGIN,
        'User Login',
        `${user.full_name} (${user.role}) logged in`,
        { userId: user.id }
      );
    }

    // 2. Notify Team Lead if user is team member
    if (user.team_id) {
      await notifyTeamLead(
        user.team_id,
        NotificationType.USER_LOGIN,
        'Team Member Login',
        `${user.full_name} logged in`,
        { userId: user.id }
      );
    }

    // Return token and user info (exclude password_hash)
    res.json({
      success: true,
      data: {
        token,
        require_password_change: user.must_change_password, // FLAG for frontend
        user: {
          id: user.id,
          employee_id: user.employee_id,
          mobile_number: user.mobile_number,
          full_name: user.full_name,
          dob: user.dob,
          gender: user.gender,
          email: user.email,
          role: user.role,
          team_id: user.team_id,
          team_name: user.team?.name || null,
          created_at: user.created_at,
        },
      },
    });
  } catch (error) {
    logger.error('Login error', { error: (error as Error).message });
    res.status(500).json({
      success: false,
      error: 'Login failed. Please try again.',
    });
  }
}


// signup removed


/**
 * POST /api/auth/register
 * Register a new user (Admin only)
 * Creates user with hashed password and specified role
 */
export async function register(req: Request, res: Response): Promise<void> {
  try {
    const { employee_id, mobile_number, password, full_name, role, team_id, dob, gender } = req.body;

    // Validate required fields
    if (!employee_id || !password || !full_name) {
      res.status(400).json({
        success: false,
        error: 'Employee ID, password, and full name are required',
      });
      return;
    }

    // Validate role
    const validRoles = ['ADMIN', 'LEAD', 'EMPLOYEE'];
    const userRole = role && validRoles.includes(role) ? role : 'EMPLOYEE';

    // Validate password strength
    if (password.length < 6) {
      res.status(400).json({
        success: false,
        error: 'Password must be at least 6 characters',
      });
      return;
    }

    // Check if employee_id already exists
    const existingUser = await prisma.user.findUnique({
      where: { employee_id },
    });

    if (existingUser) {
      res.status(409).json({
        success: false,
        error: 'Employee ID already registered',
      });
      return;
    }

    // Check mobile if provided
    if (mobile_number) {
      const existingMobile = await prisma.user.findUnique({
        where: { mobile_number },
      });
      if (existingMobile) {
        res.status(409).json({
          success: false,
          error: 'Mobile number already registered to another user',
        });
        return;
      }
    }

    // Hash password with bcrypt (10 rounds)
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    // Create new user
    const newUser = await prisma.user.create({
      data: {
        employee_id,
        mobile_number: mobile_number || null,
        password_hash,
        full_name,
        role: userRole,
        team_id: team_id || null,
        must_change_password: true, // Force password change
        dob: dob ? new Date(dob) : null,
        gender: gender || null,
      },
    });

    logger.auth('register', newUser.id, {
      role: newUser.role,
      createdBy: req.user?.userId || 'admin'
    });

    res.status(201).json({
      success: true,
      data: {
        user: {
          id: newUser.id,
          employee_id: newUser.employee_id,
          mobile_number: newUser.mobile_number,
          full_name: newUser.full_name,
          email: newUser.email,
          role: newUser.role,
          team_id: newUser.team_id,
          created_at: newUser.created_at,
          dob: newUser.dob,
          gender: newUser.gender,
        },
      },
    });
  } catch (error) {
    logger.error('Registration error', { error: (error as Error).message });
    res.status(500).json({
      success: false,
      error: 'Registration failed. Please try again.',
    });
  }
}

/**
 * POST /api/auth/change-password
 * Change password for authenticated user
 */
export async function changePassword(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    const { old_password, new_password } = req.body;

    if (!userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    if (!new_password || new_password.length < 6) {
      res.status(400).json({
        success: false,
        error: 'New password must be at least 6 characters',
      });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    // Check old password (if provided) or if user is must_change_password we might skip?
    // Better security: always check old password if user is logged in
    if (old_password) {
      const isValid = await bcrypt.compare(old_password, user.password_hash);
      if (!isValid) {
        res.status(400).json({ success: false, error: 'Incorrect old password' });
        return;
      }
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(new_password, salt);

    await prisma.user.update({
      where: { id: userId },
      data: {
        password_hash,
        must_change_password: false,
      },
    });

    logger.auth('change_password', userId, { role: user.role as any });

    res.json({
      success: true,
      message: 'Password changed successfully',
    });

  } catch (error) {
    logger.error('Change password error', { error: (error as Error).message });
    res.status(500).json({
      success: false,
      error: 'Failed to change password',
    });
  }
}


/**
 * GET /api/auth/me
 * Get current authenticated user's profile
 */
export async function getProfile(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { team: true },
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
          dob: user.dob,
          gender: user.gender,
          email: user.email,
          role: user.role,
          team_id: user.team_id,
          team_name: user.team?.name || null,
          created_at: user.created_at,
        },
      },
    });
  } catch (error) {
    logger.error('Get profile error', { error: (error as Error).message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch profile',
    });
  }
}

/**
 * GET /api/auth/login-history/:userId
 * Get login history for a user (Admin only)
 */
export async function getLoginHistory(req: Request, res: Response): Promise<void> {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 20 } = req.query;

    const pageNum = Math.max(1, parseInt(page as string, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10)));
    const skip = (pageNum - 1) * limitNum;

    // Get login history with pagination
    const [history, total] = await Promise.all([
      prisma.loginHistory.findMany({
        where: { user_id: userId },
        orderBy: { logged_in_at: 'desc' },
        take: limitNum,
        skip,
      }),
      prisma.loginHistory.count({ where: { user_id: userId } }),
    ]);

    res.json({
      success: true,
      data: {
        login_history: history.map(h => ({
          id: h.id,
          device_name: h.device_name,
          ip_address: h.ip_address,
          user_agent: h.user_agent,
          logged_in_at: h.logged_in_at,
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
    logger.error('Get login history error', { error: (error as Error).message });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch login history',
    });
  }
}

export async function updateProfile(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId;
    const { email, dob, gender } = req.body;

    if (!userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({
        success: false,
        error: 'Invalid email format',
      });
      return;
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        email: email,
        dob: dob ? new Date(dob) : undefined,
        gender: gender,
      },
      include: { team: true },
    });

    res.json({
      success: true,
      data: {
        user: {
          id: updatedUser.id,
          mobile_number: updatedUser.mobile_number,
          full_name: updatedUser.full_name,
          email: updatedUser.email,
          role: updatedUser.role,
          team_id: updatedUser.team_id,
          team_name: updatedUser.team?.name || null,
          created_at: updatedUser.created_at,
          dob: updatedUser.dob,
          gender: updatedUser.gender,
        },
      },
    });
  } catch (error) {
    logger.error('Update profile error', { error: (error as Error).message });
    res.status(500).json({
      success: false,
      error: 'Failed to update profile',
    });
  }
}

export default { login, register, getProfile, getLoginHistory, updateProfile, changePassword };
