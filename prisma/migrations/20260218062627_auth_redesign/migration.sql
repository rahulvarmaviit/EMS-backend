/*
  Warnings:

  - A unique constraint covering the columns `[employee_id]` on the table `users` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `employee_id` to the `users` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "BreakType" AS ENUM ('WALKING', 'TEA', 'LUNCH');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "employee_id" TEXT NOT NULL,
ADD COLUMN     "must_change_password" BOOLEAN NOT NULL DEFAULT true,
ALTER COLUMN "mobile_number" DROP NOT NULL;

-- CreateTable
CREATE TABLE "breaks" (
    "id" TEXT NOT NULL,
    "type" "BreakType" NOT NULL,
    "duration_min" INTEGER NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "end_time" TIMESTAMP(3),
    "attendance_id" TEXT NOT NULL,

    CONSTRAINT "breaks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "breaks_attendance_id_idx" ON "breaks"("attendance_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_employee_id_key" ON "users"("employee_id");

-- AddForeignKey
ALTER TABLE "breaks" ADD CONSTRAINT "breaks_attendance_id_fkey" FOREIGN KEY ("attendance_id") REFERENCES "attendance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
