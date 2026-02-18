// Authentication Routes
// Purpose: Login, registration, and profile endpoints

import { Router } from 'express';
import { login, register, getProfile, getLoginHistory, updateProfile, changePassword } from '../controllers/authController';
import { authenticate, optionalAuthenticate, authorize } from '../middlewares/auth';

const router = Router();

// Public routes (no auth required)
router.post('/login', login);

// Protected routes
router.get('/me', authenticate, getProfile);
router.put('/profile', authenticate, updateProfile);
router.post('/change-password', authenticate, changePassword);

// Admin only - register new users with role assignment
router.post('/register', authenticate, authorize('ADMIN'), register);

// Admin only - view login history for a user
router.get('/login-history/:userId', authenticate, authorize('ADMIN'), getLoginHistory);

export default router;
