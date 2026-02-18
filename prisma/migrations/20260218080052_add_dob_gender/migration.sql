-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'BIRTHDAY';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "dob" TIMESTAMP(3),
ADD COLUMN     "gender" TEXT;
