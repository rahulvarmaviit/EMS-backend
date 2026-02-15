// Team Routes
// Purpose: Team management endpoints

import { Router } from 'express';
import { listTeams, createTeam, getTeam, updateTeam, deleteTeam } from '../controllers/teamController';
import { authenticate, authorize } from '../middlewares/auth';

const router = Router();

// All routes require authentication
router.use(authenticate);

// All authenticated users can view teams
router.get('/', listTeams);
router.get('/:id', getTeam);

// Admin only - create, update, delete teams
router.post('/', authorize('ADMIN'), createTeam);
router.patch('/:id', authorize('ADMIN'), updateTeam);
router.delete('/:id', authorize('ADMIN'), deleteTeam);

export default router;
