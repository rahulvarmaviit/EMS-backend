// Request Logging Middleware
// Purpose: Log all HTTP requests for monitoring and debugging

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

/**
 * Middleware to log all incoming HTTP requests
 * Captures method, path, status code, and response time
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();
  
  // Log after response is finished
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const userId = req.user?.userId;
    
    // Skip logging health check to reduce noise
    if (req.path === '/health') {
      return;
    }
    
    logger.request(
      req.method,
      req.path,
      res.statusCode,
      duration,
      userId
    );
  });
  
  next();
}

export default requestLogger;
