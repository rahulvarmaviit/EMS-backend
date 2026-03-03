import { Router } from 'express';
import {
    getActiveProjects,
    getAllProjects,
    createProject,
    updateProject,
    toggleProjectStatus,
    deleteProject
} from '../controllers/projectController';
import { authenticate, authorize } from '../middlewares/auth';

const router = Router();

// Public/App route - get active projects (for work log dropdown)
router.get('/', authenticate, getActiveProjects);

// Admin routes
router.get('/all', authenticate, authorize('ADMIN', 'POSTGRES_SQL'), getAllProjects);
router.post('/', authenticate, authorize('ADMIN', 'POSTGRES_SQL'), createProject);
router.put('/:id', authenticate, authorize('ADMIN', 'POSTGRES_SQL'), updateProject);
router.patch('/:id/status', authenticate, authorize('ADMIN', 'POSTGRES_SQL'), toggleProjectStatus);
router.delete('/:id', authenticate, authorize('ADMIN', 'POSTGRES_SQL'), deleteProject);

export default router;
