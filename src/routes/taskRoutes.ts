// Task Assignment Routes
// Purpose: Routes for team lead task assignment operations

import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authenticate, authorize } from '../middlewares/auth';
import {
    createTask,
    getMyTasks,
    getCreatedTasks,
    getTasksForEmployee,
    updateTask,
    updateTaskStatus,
    deleteTask,
    downloadTaskDocument,
    addTaskComment,
    getTaskComments,
} from '../controllers/taskController';

const router = Router();

// ============================================
// MULTER CONFIG FOR TASK DOCUMENTS
// ============================================

// Ensure task uploads directory exists
const taskUploadDir = 'uploads/tasks';
if (!fs.existsSync(taskUploadDir)) {
    fs.mkdirSync(taskUploadDir, { recursive: true });
}

const taskStorage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, taskUploadDir);
    },
    filename: (_req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const safeName = file.originalname.replace(/[^a-zA-Z0-9.]/g, '_');
        cb(null, `${uniqueSuffix}-${safeName}`);
    },
});

const allowedMimeTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/png',
    'image/jpeg',
];

const taskFileFilter = (
    _req: any,
    file: Express.Multer.File,
    cb: multer.FileFilterCallback
) => {
    if (allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('File type not allowed. Supported: PDF, DOC, DOCX, XLS, XLSX, PNG, JPG'));
    }
};

const taskUpload = multer({
    storage: taskStorage,
    fileFilter: taskFileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB per file
        files: 5, // Max 5 files per request
    },
});

// ============================================
// ROUTES
// ============================================

// Create task with optional file uploads (LEAD only)
router.post(
    '/',
    authenticate,
    authorize('LEAD'),
    (req, res, next) => {
        taskUpload.array('documents', 5)(req, res, (err: any) => {
            if (err) {
                if (err.code === 'LIMIT_FILE_SIZE') {
                    return res.status(400).json({ success: false, error: 'File size exceeds 10MB limit' });
                }
                if (err.code === 'LIMIT_FILE_COUNT') {
                    return res.status(400).json({ success: false, error: 'Maximum 5 files allowed per task' });
                }
                return res.status(400).json({ success: false, error: err.message });
            }
            next();
        });
    },
    createTask
);

// Get tasks assigned to logged-in user
router.get('/my', authenticate, getMyTasks);

// Get all tasks created (assigned) by this lead
router.get('/created', authenticate, getCreatedTasks);

// Get tasks created by lead for a specific employee
router.get('/employee/:employeeId', authenticate, authorize('LEAD'), getTasksForEmployee);

// Update task details (LEAD only)
router.patch('/:id', authenticate, authorize('LEAD'), updateTask);

// Update task status (Employee or Lead)
router.patch('/:id/status', authenticate, updateTaskStatus);

// Delete task (LEAD only)
router.delete('/:id', authenticate, authorize('LEAD'), deleteTask);

// Download task document
router.get('/document/:id', authenticate, downloadTaskDocument);

// Task comments
router.post('/:id/comments', authenticate, addTaskComment);
router.get('/:id/comments', authenticate, getTaskComments);

export default router;
