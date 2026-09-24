/*
  Warnings:

  - You are about to drop the column `kpis` on the `Measurement` table. All the data in the column will be lost.
  - Added the required column `rawObservations` to the `Measurement` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Measurement"
RENAME COLUMN "kpis" TO "rawObservations";
