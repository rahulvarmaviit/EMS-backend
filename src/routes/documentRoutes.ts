import express from 'express';
import { authenticate } from '../middlewares/auth';
import { upload } from '../middlewares/upload';
import { uploadDocument, getDocuments } from '../controllers/documentController';

const router = express.Router();

// Upload document (PDF only, max 10MB)
// 'file' is the key name in the form-data
router.post('/upload', authenticate, (req, res, next) => {
    upload.single('file')(req, res, (err: any) => {
        if (err) {
            // Handle Multer errors (e.g., file too large, wrong type)
            if (err.message === 'Only PDF files are allowed!') {
                return res.status(400).json({ error: 'Only PDF files are allowed' });
            }
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({ error: 'File size limit exceeded (Max 10MB)' });
            }
            return res.status(400).json({ error: err.message });
        }
        next();
    });
}, uploadDocument);

// Get all documents for user
router.get('/', authenticate, getDocuments);

// Get documents for a specific user (Admin/Lead)
import { getUserDocuments, downloadDocument } from '../controllers/documentController';
import { authorize } from '../middlewares/auth';

router.get('/user/:userId', authenticate, authorize('ADMIN', 'LEAD'), getUserDocuments);

// Download document (Admin/Lead/Owner)
router.get('/download/:id', authenticate, downloadDocument);

export default router;
