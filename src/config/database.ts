// Database Configuration
// Purpose: Prisma Client instance for database access

import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

// Create Prisma Client instance
export const prisma = new PrismaClient({
  log: [
    { level: 'query', emit: 'event' },
    { level: 'error', emit: 'stdout' },
    { level: 'info', emit: 'stdout' },
    { level: 'warn', emit: 'stdout' },
  ],
});

// Log query events
prisma.$on('query', (e: any) => {
  if (e.duration > 100) {
    logger.warn('Slow query detected', {
      query: e.query,
      params: e.params,
      duration: `${e.duration}ms`,
    });
  }
});

/**
 * Check database connection health
 */
export async function checkConnection(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    logger.error('Database connection check failed', { error: (error as Error).message });
    return false;
  }
}

/**
 * Graceful shutdown
 */
export async function closePool(): Promise<void> {
  await prisma.$disconnect();
  logger.info('Prisma Client disconnected');
}

export default { prisma, checkConnection, closePool };
