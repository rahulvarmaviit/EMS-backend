// User Routes
// Purpose: User management endpoints

import { Router } from 'express';
import { listUsers, getUser, assignTeam, deleteUser } from '../controllers/userController';
import { authenticate, authorize } from '../middlewares/auth';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Admin and Lead can list users
router.get('/', authorize('ADMIN', 'LEAD'), listUsers);

// Admin and Lead can view user details
router.get('/:id', authorize('ADMIN', 'LEAD'), getUser);

// Admin only - assign team
router.patch('/:id/assign-team', authorize('ADMIN'), assignTeam);

// Admin only - delete user
router.delete('/:id', authorize('ADMIN'), deleteUser);

// Admin only - reset credentials
import { resetCredentials } from '../controllers/userController';
router.patch('/:id/reset-credentials', authorize('ADMIN'), resetCredentials);

export default router;
