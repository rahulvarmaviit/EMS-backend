-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'BREAK_COMPLETED';

-- AlterTable
ALTER TABLE "leave_requests" ADD COLUMN     "response_reason" TEXT,
ADD COLUMN     "response_subject" TEXT,
ADD COLUMN     "subject" TEXT NOT NULL DEFAULT 'Leave Request';
