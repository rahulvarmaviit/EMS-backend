-- Apply this migration manually to rename SUPER_ADMIN to POSTGRES_SQL
-- Run with: npx prisma db execute --file prisma/migrations/rename_enum.sql --schema prisma/schema.prisma

-- Step 1: Add the new enum value
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'POSTGRES_SQL';

-- Step 2: Update all existing SUPER_ADMIN users to POSTGRES_SQL  
UPDATE "users" SET "role" = 'POSTGRES_SQL' WHERE "role" = 'SUPER_ADMIN';

-- Note: Removing the old enum value requires recreating the type
-- We'll leave SUPER_ADMIN in the enum for now to avoid breaking the database
-- The application code will only use POSTGRES_SQL going forward
