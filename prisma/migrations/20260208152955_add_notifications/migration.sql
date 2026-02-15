-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('USER_LOGIN', 'ATTENDANCE_CHECKIN', 'ATTENDANCE_CHECKOUT', 'LEAVE_REQUEST', 'LEAVE_APPROVED', 'LEAVE_REJECTED', 'LEAVE_REVOKED', 'TEAM_MEMBER_ASSIGNED', 'TEAM_LEAD_ASSIGNED');

-- AlterEnum
ALTER TYPE "LeaveStatus" ADD VALUE 'REVOKED';

-- AlterTable
ALTER TABLE "leave_requests" ADD COLUMN     "approved_by_id" TEXT,
ADD COLUMN     "rejected_by_id" TEXT,
ADD COLUMN     "revocation_reason" TEXT,
ADD COLUMN     "revoked_by_id" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "fcm_token" TEXT;

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_rejected_by_id_fkey" FOREIGN KEY ("rejected_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_revoked_by_id_fkey" FOREIGN KEY ("revoked_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
