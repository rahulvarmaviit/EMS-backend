
import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { notifyUsersByRole } from '../services/notificationService';
import { NotificationType } from '@prisma/client';

// POST /api/announcements
export async function createAnnouncement(req: Request, res: Response): Promise<void> {
    try {
        const { title, message, type, expires_at } = req.body;

        const announcement = await prisma.announcement.create({
            data: {
                title,
                message,
                type: type || 'NORMAL',
                expires_at: expires_at ? new Date(expires_at) : null,
            },
        });

        // Notify all employees and leads
        // We can run this in background
        logger.info(`Sending notifications for announcement: ${announcement.id}`);
        notifyUsersByRole('EMPLOYEE', NotificationType.ANNOUNCEMENT, title, message, { announcementId: announcement.id });
        notifyUsersByRole('LEAD', NotificationType.ANNOUNCEMENT, title, message, { announcementId: announcement.id });

        res.status(201).json({ success: true, data: announcement });
    } catch (error) {
        logger.error('Error creating announcement:', { error });
        res.status(500).json({ error: 'Failed to create announcement' });
    }
}

// GET /api/announcements
export async function getAnnouncements(req: Request, res: Response): Promise<void> {
    try {
        const announcements = await prisma.announcement.findMany({
            where: { is_active: true },
            orderBy: { created_at: 'desc' },
            take: 20,
        });

        res.json({ success: true, data: announcements });
    } catch (error) {
        logger.error('Error fetching announcements:', { error });
        res.status(500).json({ error: 'Failed to fetch announcements' });
    }
}

// POST /api/events
export async function createEvent(req: Request, res: Response): Promise<void> {
    try {
        const { title, description, event_date, location } = req.body;

        const event = await prisma.event.create({
            data: {
                title,
                description,
                event_date: new Date(event_date),
                location,
            },
        });

        // Notify all employees and leads
        notifyUsersByRole('EMPLOYEE', NotificationType.EVENT_CREATED, `New Event: ${title}`, description, { eventId: event.id });
        notifyUsersByRole('LEAD', NotificationType.EVENT_CREATED, `New Event: ${title}`, description, { eventId: event.id });

        res.status(201).json({ success: true, data: event });
    } catch (error) {
        logger.error('Error creating event:', { error });
        res.status(500).json({ error: 'Failed to create event' });
    }
}

// GET /api/events
export async function getEvents(req: Request, res: Response): Promise<void> {
    try {
        // Fetch future events or recent ones
        const events = await prisma.event.findMany({
            where: {
                is_active: true,
                event_date: {
                    gte: new Date(new Date().setHours(0, 0, 0, 0)) // Events from today onwards
                }
            },
            orderBy: { event_date: 'asc' },
        });

        res.json({ success: true, data: events });
    } catch (error) {
        logger.error('Error fetching events:', { error });
        res.status(500).json({ error: 'Failed to fetch events' });
    }
}

// PUT /api/announcements/:id
export async function updateAnnouncement(req: Request, res: Response): Promise<void> {
    try {
        const { id } = req.params;
        const { title, message, type, expires_at } = req.body;

        const announcement = await prisma.announcement.update({
            where: { id },
            data: {
                title,
                message,
                type,
                expires_at: expires_at ? new Date(expires_at) : null,
            },
        });

        res.json({ success: true, data: announcement });
    } catch (error) {
        logger.error('Error updating announcement:', { error });
        res.status(500).json({ error: 'Failed to update announcement' });
    }
}

// DELETE /api/announcements/:id
export async function deleteAnnouncement(req: Request, res: Response): Promise<void> {
    try {
        const { id } = req.params;

        await prisma.announcement.delete({
            where: { id },
        });

        res.json({ success: true, message: 'Announcement deleted successfully' });
    } catch (error) {
        logger.error('Error deleting announcement:', { error });
        res.status(500).json({ error: 'Failed to delete announcement' });
    }
}

// PUT /api/events/:id
export async function updateEvent(req: Request, res: Response): Promise<void> {
    try {
        const { id } = req.params;
        const { title, description, event_date, location } = req.body;

        const event = await prisma.event.update({
            where: { id },
            data: {
                title,
                description,
                event_date: event_date ? new Date(event_date) : undefined,
                location,
            },
        });

        res.json({ success: true, data: event });
    } catch (error) {
        logger.error('Error updating event:', { error });
        res.status(500).json({ error: 'Failed to update event' });
    }
}

// DELETE /api/events/:id
export async function deleteEvent(req: Request, res: Response): Promise<void> {
    try {
        const { id } = req.params;

        await prisma.event.delete({
            where: { id },
        });

        res.json({ success: true, message: 'Event deleted successfully' });
    } catch (error) {
        logger.error('Error deleting event:', { error });
        res.status(500).json({ error: 'Failed to delete event' });
    }
}
