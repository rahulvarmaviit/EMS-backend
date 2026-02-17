// Attendance Routes
// Purpose: Check-in, check-out, attendance history, and break endpoints

import { Router } from 'express';
import { checkIn, checkOut, getSelfAttendance, getTeamAttendance, getUserAttendance, startBreak, endBreak, getBreaks } from '../controllers/attendanceController';
import { authenticate, authorize } from '../middlewares/auth';

const router = Router();

// All routes require authentication
router.use(authenticate);

// All authenticated users can check in/out and view their own history
router.post('/check-in', checkIn);
router.post('/check-out', checkOut);
router.get('/self', getSelfAttendance);

// Break management (all authenticated users)
router.post('/break/start', startBreak);
router.post('/break/end', endBreak);

// Admin and Lead can view team attendance
router.get('/team/:teamId', authorize('ADMIN', 'LEAD'), getTeamAttendance);

// Admin and Lead can view specific user attendance and breaks
router.get('/user/:userId', authorize('ADMIN', 'LEAD'), getUserAttendance);
router.get('/breaks/:attendanceId', authorize('ADMIN', 'LEAD'), getBreaks);

export default router;
