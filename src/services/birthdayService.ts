import cron from 'node-cron';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { NotificationType } from '@prisma/client';
import { notifyUsersByRole, createNotification } from './notificationService';

/**
 * Service to handle birthday notifications
 */
export class BirthdayService {
    /**
     * Initialize the birthday cron job
     * Runs every day at 12:01 AM
     */
    public static init() {
        // Schedule task to run at 00:01 every day
        cron.schedule('1 0 * * *', async () => {
            logger.info('Running daily birthday check...');
            await this.checkBirthdays();
        });

        // Also run immediately on startup if needed, or just log
        logger.info('Birthday service initialized');

        // Optional: Run check on startup for development testing
        this.checkBirthdays();
    }

    /**
     * Check for users with birthdays today and send notifications
     */
    public static async checkBirthdays() {
        try {
            const today = new Date();
            const month = today.getMonth() + 1; // getMonth() is 0-indexed
            const day = today.getDate();

            // Find users with birthday today
            // Prisma doesn't support complex date extraction natively in all DBs easily like SQL
            // But for Postgres we can use raw query or fetch all active users and filter in JS (if user base is small)
            // For scalability, raw query is better.

            const users = await prisma.$queryRaw`
        SELECT id, full_name, role, team_id, dob FROM "users"
        WHERE is_active = true
        AND EXTRACT(MONTH FROM dob) = ${month}
        AND EXTRACT(DAY FROM dob) = ${day}
      ` as any[];

            logger.info(`Found ${users.length} users with birthdays today`);

            for (const user of users) {
                await this.processBirthday(user);
            }
        } catch (error) {
            logger.error('Error checking birthdays', { error: (error as Error).message });
        }
    }

    /**
     * Process birthday for a single user
     */
    private static async processBirthday(user: any) {
        try {
            const { id, full_name } = user;

            // 1. Create Notification for the User (Happy Birthday!)
            // 1. Create Notification for the User (Happy Birthday!)
            // Using createNotification to ensure Push Notification is also sent
            await createNotification(
                id,
                (NotificationType as any).BIRTHDAY,
                'Happy Birthday!',
                `Happy Birthday ${full_name}! We wish you a fantastic day filled with joy and success! 🎂`,
                { isBirthday: true }
            );

            // 2. Notify Admins
            await notifyUsersByRole(
                'ADMIN',
                (NotificationType as any).BIRTHDAY,
                'Employee Birthday',
                `Today is ${full_name}'s birthday!`,
                { employeeId: id }
            );

            // 3. Notify Team Lead (if applicable)
            if (user.team_id) {
                // This would require fetching the lead ID for the team, similar to notifyTeamLead implementation
                // Skipping for now to keep it simple, or reused notifyTeamLead if imported
            }

            logger.info(`Processed birthday for ${full_name} (${id})`);
        } catch (error) {
            logger.error(`Error processing birthday for ${user.id}`, { error: (error as Error).message });
        }
    }
}
