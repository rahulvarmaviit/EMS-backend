// Authentication Routes
// Purpose: Login, registration, and profile endpoints

import { Router } from 'express';
import { login, signup, register, getProfile, getLoginHistory, updateProfile } from '../controllers/authController';
import { authenticate, optionalAuthenticate, authorize } from '../middlewares/auth';

const router = Router();

// Public routes (no auth required)
router.post('/login', login);

// Self-registration for employees (public)
router.post('/signup', signup);

// Protected routes
router.get('/me', authenticate, getProfile);
router.put('/profile', authenticate, updateProfile);

// Admin only - register new users with role assignment
router.post('/register', authenticate, authorize('ADMIN'), register);

// Admin only - view login history for a user
router.get('/login-history/:userId', authenticate, authorize('ADMIN'), getLoginHistory);

export default router;
