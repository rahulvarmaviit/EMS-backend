-- AlterTable
ALTER TABLE "attendance" ADD COLUMN     "check_out_lat" DECIMAL(65,30),
ADD COLUMN     "check_out_long" DECIMAL(65,30),
ADD COLUMN     "meetings" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "project_name" TEXT,
ADD COLUMN     "todo_updates" TEXT,
ADD COLUMN     "work_done" TEXT;

-- CreateTable
CREATE TABLE "login_history" (
    "id" TEXT NOT NULL,
    "device_name" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "logged_in_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "login_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "login_history_user_id_idx" ON "login_history"("user_id");

-- AddForeignKey
ALTER TABLE "login_history" ADD CONSTRAINT "login_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
