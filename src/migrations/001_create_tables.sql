-- Migration: 001_create_tables
-- Purpose: Create all core tables for the Geo-Attendance System
-- Date: 2026-01-25

-- Enable UUID extension for generating unique identifiers
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- TABLE 1: teams
-- Purpose: Organizational units (Engineering, Marketing, etc.)
-- Created FIRST because users reference teams
-- ============================================
CREATE TABLE IF NOT EXISTS teams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    lead_id UUID NULL, -- Will add FK after users table exists
    is_active BOOLEAN NOT NULL DEFAULT true, -- Soft delete flag
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Index for quick team name lookups
CREATE INDEX IF NOT EXISTS idx_teams_name ON teams(name);
CREATE INDEX IF NOT EXISTS idx_teams_is_active ON teams(is_active);

COMMENT ON TABLE teams IS 'Organizational units with assigned team leads';
COMMENT ON COLUMN teams.lead_id IS 'FK to users.id - set after user creation to avoid circular dependency';
COMMENT ON COLUMN teams.is_active IS 'Soft delete: false means team is deactivated';

-- ============================================
-- TABLE 2: users
-- Purpose: All system users (Admin, Lead, Employee)
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mobile_number VARCHAR(20) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('ADMIN', 'LEAD', 'EMPLOYEE')),
    team_id UUID NULL REFERENCES teams(id) ON DELETE SET NULL,
    is_active BOOLEAN NOT NULL DEFAULT true, -- Soft delete flag
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Index for fast login lookups (most critical query)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_mobile_number ON users(mobile_number);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_team_id ON users(team_id);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);

COMMENT ON TABLE users IS 'All system users with credentials and role-based access';
COMMENT ON COLUMN users.mobile_number IS 'Login ID - must be unique';
COMMENT ON COLUMN users.password_hash IS 'Bcrypt hashed password - never store plain text';
COMMENT ON COLUMN users.role IS 'Access level: ADMIN (full), LEAD (team view), EMPLOYEE (self only)';
COMMENT ON COLUMN users.is_active IS 'Soft delete: false means user is deactivated';

-- ============================================
-- Add FK from teams.lead_id to users.id
-- Done after users table exists to avoid circular dependency
-- Using DO block to make it idempotent
-- ============================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_teams_lead_id'
    ) THEN
        ALTER TABLE teams 
        ADD CONSTRAINT fk_teams_lead_id 
        FOREIGN KEY (lead_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

-- ============================================
-- TABLE 3: locations
-- Purpose: Office geofences for check-in validation
-- ============================================
CREATE TABLE IF NOT EXISTS locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    latitude DECIMAL(10, 8) NOT NULL, -- Precision: 8 decimal places (~1mm accuracy)
    longitude DECIMAL(11, 8) NOT NULL, -- Longitude needs 11 digits for -180 to 180
    radius_meters INTEGER NOT NULL DEFAULT 50, -- Default 50m radius
    is_active BOOLEAN NOT NULL DEFAULT true, -- Soft delete flag
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- Ensure radius is reasonable (1m to 1000m)
    CONSTRAINT chk_radius_range CHECK (radius_meters >= 1 AND radius_meters <= 1000)
);

CREATE INDEX IF NOT EXISTS idx_locations_is_active ON locations(is_active);

COMMENT ON TABLE locations IS 'Office geofences - GPS coordinates with acceptance radius';
COMMENT ON COLUMN locations.latitude IS 'GPS latitude (-90 to 90)';
COMMENT ON COLUMN locations.longitude IS 'GPS longitude (-180 to 180)';
COMMENT ON COLUMN locations.radius_meters IS 'Geofence boundary in meters (1-1000m)';

-- ============================================
-- TABLE 4: attendance
-- Purpose: Daily check-in/check-out records with GPS proof
-- ============================================
CREATE TABLE IF NOT EXISTS attendance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    check_in_time TIMESTAMP WITH TIME ZONE NOT NULL,
    check_out_time TIMESTAMP WITH TIME ZONE NULL, -- NULL until user checks out
    check_in_lat DECIMAL(10, 8) NOT NULL, -- GPS proof at check-in
    check_in_long DECIMAL(11, 8) NOT NULL,
    check_out_lat DECIMAL(10, 8) NULL, -- GPS proof at check-out
    check_out_long DECIMAL(11, 8) NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('PRESENT', 'LATE', 'HALF_DAY')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- One attendance record per user per day
    CONSTRAINT uq_user_date UNIQUE (user_id, date)
);

-- Composite index for fast history queries (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_attendance_user_date ON attendance(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_status ON attendance(status);

COMMENT ON TABLE attendance IS 'Daily attendance records with GPS verification';
COMMENT ON COLUMN attendance.date IS 'Attendance date (one record per user per day)';
COMMENT ON COLUMN attendance.check_in_lat IS 'GPS latitude at check-in - audit trail';
COMMENT ON COLUMN attendance.status IS 'PRESENT (on-time), LATE (after threshold), HALF_DAY (partial)';

-- ============================================
-- FUNCTION: Auto-update updated_at timestamp
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to tables with updated_at column (using DROP IF EXISTS for idempotency)
DROP TRIGGER IF EXISTS trigger_users_updated_at ON users;
CREATE TRIGGER trigger_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_teams_updated_at ON teams;
CREATE TRIGGER trigger_teams_updated_at
    BEFORE UPDATE ON teams
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_locations_updated_at ON locations;
CREATE TRIGGER trigger_locations_updated_at
    BEFORE UPDATE ON locations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Migration complete
-- ============================================
