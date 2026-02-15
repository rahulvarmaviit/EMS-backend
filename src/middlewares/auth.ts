// Authentication Middleware
// Purpose: JWT verification and role-based access control (RBAC)

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import config from '../config/env';
import { logger } from '../utils/logger';

// User payload stored in JWT token
export interface JwtPayload {
  userId: string;
  mobile_number: string;
  role: 'SUPER_ADMIN' | 'ADMIN' | 'LEAD' | 'EMPLOYEE';
  iat?: number;
  exp?: number;
}

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/**
 * Verify JWT token and attach user to request
 * Use this middleware on all protected routes
 */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  try {
    // Get token from Authorization header or query parameter
    let token: string | undefined;
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.query.token) {
      token = req.query.token as string;
    }

    if (!token) {
      res.status(401).json({
        success: false,
        error: 'No token provided. Please login.'
      });
      return;
    }

    // Verify token
    const decoded = jwt.verify(token, config.JWT_SECRET) as JwtPayload;

    // Attach user to request for use in controllers
    req.user = decoded;

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      logger.auth('failed_login', undefined, { reason: 'token_expired' });
      res.status(401).json({
        success: false,
        error: 'Token expired. Please login again.'
      });
      return;
    }

    if (error instanceof jwt.JsonWebTokenError) {
      logger.auth('failed_login', undefined, { reason: 'invalid_token' });
      res.status(401).json({
        success: false,
        error: 'Invalid token. Please login again.'
      });
      return;
    }

    logger.error('Auth middleware error', { error: (error as Error).message });
    res.status(500).json({
      success: false,
      error: 'Authentication failed'
    });
  }
}

/**
 * Optional authentication - attaches user if token exists, but doesn't require it
 * Useful for routes that behave differently for authenticated vs anonymous users
 */
export function optionalAuthenticate(req: Request, res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, config.JWT_SECRET) as JwtPayload;
      req.user = decoded;
    }

    next();
  } catch (error) {
    // Token invalid or expired, continue without user
    next();
  }
}

/**
 * Role-based access control middleware factory
 * Use: authorize('ADMIN') or authorize('ADMIN', 'LEAD')
 * @param allowedRoles - Roles that can access this route
 */
export function authorize(...allowedRoles: ('SUPER_ADMIN' | 'ADMIN' | 'LEAD' | 'EMPLOYEE')[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Must be authenticated first
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Not authenticated'
      });
      return;
    }

    // SUPER_ADMIN has access to everything
    if (req.user.role === 'SUPER_ADMIN') {
      next();
      return;
    }

    // Check if user's role is in allowed list
    if (!allowedRoles.includes(req.user.role)) {
      logger.warn('Unauthorized access attempt', {
        userId: req.user.userId,
        role: req.user.role,
        requiredRoles: allowedRoles,
        path: req.path,
      });

      res.status(403).json({
        success: false,
        error: 'You do not have permission to access this resource'
      });
      return;
    }

    next();
  };
}

/**
 * Generate JWT token for a user
 * @param payload - User data to encode in token
 * @returns Signed JWT token string
 */
export function generateToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, config.JWT_SECRET, {
    expiresIn: config.JWT_EXPIRES_IN as string,
  } as jwt.SignOptions);
}

export default { authenticate, optionalAuthenticate, authorize, generateToken };
