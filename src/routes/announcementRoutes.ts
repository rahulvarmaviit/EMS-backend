
import { Router } from 'express';
import {
    createAnnouncement,
    getAnnouncements,
    createEvent,
    getEvents,
    updateAnnouncement,
    deleteAnnouncement,
    updateEvent,
    deleteEvent
} from '../controllers/announcementController';
import { authenticate, authorize } from '../middlewares/auth';

const router = Router();

// Announcements
router.post('/announcements', authenticate, authorize('ADMIN'), createAnnouncement);
router.get('/announcements', authenticate, getAnnouncements);
router.put('/announcements/:id', authenticate, authorize('ADMIN'), updateAnnouncement);
router.delete('/announcements/:id', authenticate, authorize('ADMIN'), deleteAnnouncement);

// Events
router.post('/events', authenticate, authorize('ADMIN'), createEvent);
router.get('/events', authenticate, getEvents);
router.put('/events/:id', authenticate, authorize('ADMIN'), updateEvent);
router.delete('/events/:id', authenticate, authorize('ADMIN'), deleteEvent);

export default router;
