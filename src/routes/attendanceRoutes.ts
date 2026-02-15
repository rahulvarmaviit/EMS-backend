// Attendance Routes
// Purpose: Check-in, check-out, and attendance history endpoints

import { Router } from 'express';
import { checkIn, checkOut, getSelfAttendance, getTeamAttendance, getUserAttendance } from '../controllers/attendanceController';
import { authenticate, authorize } from '../middlewares/auth';

const router = Router();

// All routes require authentication
router.use(authenticate);

// All authenticated users can check in/out and view their own history
router.post('/check-in', checkIn);
router.post('/check-out', checkOut);
router.get('/self', getSelfAttendance);

// Admin and Lead can view team attendance
router.get('/team/:teamId', authorize('ADMIN', 'LEAD'), getTeamAttendance);

// Admin and Lead can view specific user attendance
router.get('/user/:userId', authorize('ADMIN', 'LEAD'), getUserAttendance);

export default router;
