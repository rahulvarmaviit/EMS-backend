-- Migration: 002_seed_admin
-- Purpose: Create initial admin user for first-time setup
-- Date: 2026-01-25
-- 
-- NOTE: This migration creates an admin with a VALID bcrypt hash.
-- Default credentials: +1234567890 / admin123
-- 
-- The hash below was generated using: bcrypt.hash('admin123', 10)
-- In production, change the password immediately after first login.

INSERT INTO users (mobile_number, password_hash, full_name, role)
SELECT 
    '+1234567890', 
    '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZRGjCdIFKYQ3wE8E2FKHgxRxjxsKy', 
    'System Admin', 
    'ADMIN'
WHERE NOT EXISTS (
    SELECT 1 FROM users WHERE mobile_number = '+1234567890'
);

-- The bcrypt hash above corresponds to password: admin123
-- Generated with cost factor 10
