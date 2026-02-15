// Main Application Entry Point
// Purpose: Initialize Express server with all configurations

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cron from 'node-cron';
import config, { validateEnv } from './config/env';
import { checkConnection, prisma } from './config/database';
import { logger } from './utils/logger';

import { requestLogger } from './middlewares/requestLogger';
import routes from './routes';


import documentRoutes from './routes/documentRoutes';
import { checkUpdate, downloadApp } from './controllers/updateController';


// Validate environment variables early
validateEnv();

// Create Express app
const app = express();
const httpServer = createServer(app);

// Update routes
app.get('/api/check-update', checkUpdate);
app.get('/api/download-app', downloadApp);

// Initialize Socket.IO
export const io = new Server(httpServer, {
  cors: {
    origin: '*', // Allow mobile app
    methods: ['GET', 'POST'],
  },
});

// Socket.IO Connection Handler
io.on('connection', (socket) => {
  logger.info(`Socket connected: ${socket.id}`);

  // Join user-specific room for private notifications
  socket.on('join_user', (userId: string) => {
    socket.join(`user:${userId}`);
    logger.info(`Socket ${socket.id} joined room user:${userId}`);
  });

  socket.on('disconnect', () => {
    logger.info(`Socket disconnected: ${socket.id}`);
  });
});

// ============================================
// MIDDLEWARE SETUP
// ============================================

// Enable CORS for mobile app access
app.use(cors({
  origin: '*', // Allow all origins for mobile app
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Parse JSON bodies
app.use(express.json({ limit: '10mb' }));

// Log all requests
app.use(requestLogger);

// ============================================
// HEALTH CHECK ENDPOINT
// ============================================

/**
 * GET /health
 * Health check endpoint for monitoring and load balancers
 * Returns database connection status
 */
app.get('/health', async (req: Request, res: Response) => {
  const dbHealthy = await checkConnection();

  const status = {
    status: dbHealthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: dbHealthy ? 'connected' : 'disconnected',
  };

  res.status(dbHealthy ? 200 : 503).json(status);
});

// ============================================
// API ROUTES
// ============================================

// Mount all API routes under /api prefix
app.use('/api', routes);
app.use('/api/documents', documentRoutes);

// ============================================
// ERROR HANDLING
// ============================================

// 404 handler for unknown routes
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: `Route ${req.method} ${req.path} not found`,
  });
});

// Global error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  res.status(500).json({
    success: false,
    error: 'Internal server error. Please try again later.',
  });
});

// ============================================
// CRON JOBS
// ============================================

// Clean up old notifications (older than 40 days)
// Runs every day at midnight
cron.schedule('0 0 * * *', async () => {
  try {
    const fortyDaysAgo = new Date();
    fortyDaysAgo.setDate(fortyDaysAgo.getDate() - 40);

    const result = await prisma.notification.deleteMany({
      where: {
        created_at: {
          lt: fortyDaysAgo,
        },
      },
    });

    logger.info(`Cleanup: Deleted ${result.count} notifications older than 40 days`);
  } catch (error) {
    logger.error('Cleanup failed:', { error });
  }
});

// ============================================
// SERVER STARTUP
// ============================================

async function startServer(): Promise<void> {
  try {
    // Verify database connection
    const dbConnected = await checkConnection();
    if (!dbConnected) {
      throw new Error('Failed to connect to database');
    }
    logger.info('Database connection verified');

    // Start HTTP server (with Socket.IO)
    httpServer.listen(config.PORT, '0.0.0.0', () => {
      logger.info(`Server started`, {
        port: config.PORT,
        environment: config.NODE_ENV,
        url: `http://0.0.0.0:${config.PORT}`,
      });

      console.log(`
========================================
  EMS Backend Server Running
========================================
  URL: http://0.0.0.0:${config.PORT}
  Health: http://0.0.0.0:${config.PORT}/health
  API: http://0.0.0.0:${config.PORT}/api
  Environment: ${config.NODE_ENV}
========================================
      `);
    });
  } catch (error) {
    logger.error('Server startup failed', { error: (error as Error).message });
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully');
  const { closePool } = await import('./config/database');
  await closePool();
  io.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully');
  const { closePool } = await import('./config/database');
  await closePool();
  io.close();
  process.exit(0);
});

// Start the server
startServer();

