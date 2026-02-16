-- Manual migration to rename SUPER_ADMIN to POSTGRES_SQL
-- This handles the enum rename that Prisma is having trouble with

BEGIN;

-- Step 1: Add the new enum value
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'POSTGRES_SQL';

-- Step 2: Update all existing SUPER_ADMIN users to POSTGRES_SQL
UPDATE "users" SET "role" = 'POSTGRES_SQL' WHERE "role" = 'SUPER_ADMIN';

-- Step 3: Remove the old enum value (this requires recreating the enum)
-- Create a temporary type
CREATE TYPE "Role_new" AS ENUM ('POSTGRES_SQL', 'ADMIN', 'LEAD', 'EMPLOYEE');

-- Change column to use the new type
ALTER TABLE "users" ALTER COLUMN "role" TYPE "Role_new" USING ("role"::text::"Role_new");

-- Drop the old type
DROP TYPE "Role";

-- Rename the new type to the original name
ALTER TYPE "Role_new" RENAME TO "Role";

COMMIT;
