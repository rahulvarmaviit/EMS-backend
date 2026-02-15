// Main Routes Index
// Purpose: Aggregate all route modules

import { Router } from 'express';
import authRoutes from './authRoutes';
import userRoutes from './userRoutes';
import teamRoutes from './teamRoutes';
import locationRoutes from './locationRoutes';
import attendanceRoutes from './attendanceRoutes';
import leaveRoutes from './leaveRoutes';
import notificationRoutes from './notificationRoutes';
import announcementRoutes from './announcementRoutes';
import gameRoutes from './gameRoutes';

const router = Router();

// Mount route modules
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/teams', teamRoutes);
router.use('/locations', locationRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/leaves', leaveRoutes);
router.use('/notifications', notificationRoutes);
router.use('/games', gameRoutes);
router.use('/', announcementRoutes); // Mount at root so endpoints are /api/announcements etc. or should I nest?
// Actually, looking at others: /users, /teams.
// I'll mount at root level or specific?
// If I use router.use('/', announcementRoutes) then inside it's /announcements.
// Perfect.

export default router;
