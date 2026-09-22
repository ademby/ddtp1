-- CreateEnum
CREATE TYPE "MissionState" AS ENUM ('DRAFT', 'PLANNED', 'DISPATCHED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FailureReason" AS ENUM ('MISSED_DISPATCH', 'EXECUTION_FAILED', 'DATA_INVALID');

-- CreateTable
CREATE TABLE "Mission" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "state" "MissionState" NOT NULL DEFAULT 'DRAFT',
    "droneId" TEXT NOT NULL,
    "earliestStart" TIMESTAMP(3) NOT NULL,
    "dispatchDeadline" TIMESTAMP(3),
    "failureReason" "FailureReason",
    "derivedFromId" TEXT,
    "activeRouteId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RouteRevision" (
    "id" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "geometry" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "missionId" TEXT NOT NULL,

    CONSTRAINT "RouteRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MissionResult" (
    "id" TEXT NOT NULL,
    "missionId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activeRevisionId" TEXT,

    CONSTRAINT "MissionResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Measurement" (
    "id" TEXT NOT NULL,
    "resultId" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL,
    "kpis" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Measurement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResultRevision" (
    "id" TEXT NOT NULL,
    "resultId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "rejectedMeasurementIds" JSONB NOT NULL DEFAULT '[]',
    "finalizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResultRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "key" TEXT NOT NULL,
    "missionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "Mission_activeRouteId_key" ON "Mission"("activeRouteId");

-- CreateIndex
CREATE UNIQUE INDEX "RouteRevision_missionId_revision_key" ON "RouteRevision"("missionId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "MissionResult_missionId_key" ON "MissionResult"("missionId");

-- CreateIndex
CREATE UNIQUE INDEX "MissionResult_activeRevisionId_key" ON "MissionResult"("activeRevisionId");

-- CreateIndex
CREATE UNIQUE INDEX "ResultRevision_resultId_revision_key" ON "ResultRevision"("resultId", "revision");

-- AddForeignKey
ALTER TABLE "Mission" ADD CONSTRAINT "Mission_derivedFromId_fkey" FOREIGN KEY ("derivedFromId") REFERENCES "Mission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mission" ADD CONSTRAINT "Mission_activeRouteId_fkey" FOREIGN KEY ("activeRouteId") REFERENCES "RouteRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouteRevision" ADD CONSTRAINT "RouteRevision_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MissionResult" ADD CONSTRAINT "MissionResult_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MissionResult" ADD CONSTRAINT "MissionResult_activeRevisionId_fkey" FOREIGN KEY ("activeRevisionId") REFERENCES "ResultRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Measurement" ADD CONSTRAINT "Measurement_resultId_fkey" FOREIGN KEY ("resultId") REFERENCES "MissionResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResultRevision" ADD CONSTRAINT "ResultRevision_resultId_fkey" FOREIGN KEY ("resultId") REFERENCES "MissionResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdempotencyKey" ADD CONSTRAINT "IdempotencyKey_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
