// Location Routes
// Purpose: Office location management endpoints

import { Router } from 'express';
import { listLocations, createLocation, updateLocation, deleteLocation } from '../controllers/locationController';
import { authenticate, authorize } from '../middlewares/auth';

const router = Router();

// All routes require authentication
router.use(authenticate);

// All authenticated users can view locations
router.get('/', listLocations);

// Admin only - create, update, delete locations
router.post('/', authorize('ADMIN'), createLocation);
router.patch('/:id', authorize('ADMIN'), updateLocation);
router.delete('/:id', authorize('ADMIN'), deleteLocation);

export default router;
