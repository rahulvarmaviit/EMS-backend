// Environment Configuration
// Purpose: Centralized environment variable management with validation

import dotenv from 'dotenv';

// Load .env file in development
dotenv.config();

// Environment configuration with defaults
export const config = {
  // Server settings
  PORT: parseInt(process.env.PORT || '5000', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',

  // Database (required - will fail if not set)
  DATABASE_URL: process.env.DATABASE_URL || '',

  // JWT settings (required - must be set via environment variable)
  JWT_SECRET: process.env.JWT_SECRET || '',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d', // 7 days for mobile-friendly sessions

  // Business rules
  OFFICE_START_HOUR: parseInt(process.env.OFFICE_START_HOUR || '10', 10), // Office starts at 10 AM
  OFFICE_END_HOUR: parseInt(process.env.OFFICE_END_HOUR || '18', 10), // Office ends at 6 PM
  LATE_THRESHOLD_MINUTES: parseInt(process.env.LATE_THRESHOLD_MINUTES || '60', 10), // 60 min grace (LATE after 11 AM)
  HALF_DAY_HOUR: parseInt(process.env.HALF_DAY_HOUR || '14', 10), // HALF_DAY if check-in after 2 PM or check-out before 2 PM

  // Geofencing
  SKIP_GEOFENCE: process.env.SKIP_GEOFENCE === 'true',

  // Rate limiting
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10), // 100 requests per window
};

/**
 * Validate required environment variables
 * Call this at startup to fail fast if config is missing
 */
export function validateEnv(): void {
  const required = ['DATABASE_URL', 'JWT_SECRET'];
  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}. Please set them before starting the server.`);
  }

  // Validate JWT_SECRET strength
  if (config.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters for security');
  }
}

export default config;
