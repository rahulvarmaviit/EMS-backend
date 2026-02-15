-- Migration: 003_login_history
-- Purpose: Add login history table to track device info and IP addresses
-- Date: 2026-01-25

-- ============================================
-- TABLE: login_history
-- Purpose: Track all login attempts with device and IP info
-- ============================================
CREATE TABLE IF NOT EXISTS login_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    login_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    device_name VARCHAR(255),
    ip_address VARCHAR(45), -- Supports both IPv4 and IPv6
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_login_history_user_id ON login_history(user_id);
CREATE INDEX IF NOT EXISTS idx_login_history_login_time ON login_history(login_time DESC);

COMMENT ON TABLE login_history IS 'Track login attempts with device and IP info for security auditing';
COMMENT ON COLUMN login_history.device_name IS 'Device name sent from mobile app';
COMMENT ON COLUMN login_history.ip_address IS 'Client IP address at login time';
COMMENT ON COLUMN login_history.user_agent IS 'User agent string from the request';
