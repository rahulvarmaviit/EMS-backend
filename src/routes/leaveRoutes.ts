
import { Router } from 'express';
import leaveController from '../controllers/leaveController';
import { authenticate } from '../middlewares/auth';

const router = Router();

// Apply auth middleware to all routes
router.use(authenticate);

// Create new leave request
router.post('/', leaveController.createLeaveRequest);

// Get my leave history
router.get('/self', leaveController.getMyLeaves);

// Get team leave requests (Lead/Admin)
router.get('/team', leaveController.getTeamLeaves);

// Get specific user leave requests (Lead/Admin)
router.get('/user/:userId', leaveController.getUserLeaves);

// Update leave status (Approve/Reject)
router.patch('/:id/status', leaveController.updateLeaveStatus);

// Revoke an approved leave (Admin/Lead)
router.put('/:id/revoke', leaveController.revokeLeave);

export default router;
