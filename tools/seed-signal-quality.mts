import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../apps/backend/src/generated/prisma/client.js";

const dataPath = resolve(
  process.cwd(),
  "apps/frontend/public/data/signal-quality.json",
);

const missionId = "prototype-signal-quality";
const resultId = "prototype-signal-quality-result";
const revisionId = "prototype-signal-quality-revision";
const routeId = "prototype-signal-quality-route";

const connectionString =
  "postgresql://postgres:postgres@localhost:5432/drone_drive";
  
if (!connectionString) {
  throw new Error("DATABASE_URL is not set.");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

function validateDataset(dataset: any) {
  if (dataset?.crs !== "urn:ogc:def:crs:OGC:1.3:CRS84") {
    throw new Error(
      `Expected urn:ogc:def:crs:OGC:1.3:CRS84, got ${dataset?.crs ?? "missing CRS"}.`,
    );
  }

  if (
    !Array.isArray(dataset.measurements) ||
    dataset.measurements.length === 0
  ) {
    throw new Error("Dataset contains no measurements.");
  }

  for (let i = 0; i < dataset.measurements.length; i += 1) {
    const m = dataset.measurements[i];

    if (
      !Array.isArray(m?.coordinates) ||
      m.coordinates.length !== 2 ||
      !Number.isFinite(Number(m.coordinates[0])) ||
      !Number.isFinite(Number(m.coordinates[1])) ||
      !Number.isFinite(Number(m.value))
    ) {
      throw new Error(`Invalid measurement at index ${i}.`);
    }
  }
}

try {
  const dataset = JSON.parse(await readFile(dataPath, "utf8"));

  validateDataset(dataset);

  const capturedAt = new Date("2026-09-01T00:00:00.000Z");

  // This mission has no real drive-test route: it only carries an imported
  // prototype dataset. Mission.activeRoute is non-nullable in the contract,
  // so give it a trivial two-point route spanning the dataset's extent
  // rather than leaving activeRouteId unset.
  const bounds = dataset.measurements.reduce(
    (acc: { minLon: number; minLat: number; maxLon: number; maxLat: number }, m: any) => ({
      minLon: Math.min(acc.minLon, Number(m.coordinates[0])),
      minLat: Math.min(acc.minLat, Number(m.coordinates[1])),
      maxLon: Math.max(acc.maxLon, Number(m.coordinates[0])),
      maxLat: Math.max(acc.maxLat, Number(m.coordinates[1])),
    }),
    {
      minLon: Number(dataset.measurements[0].coordinates[0]),
      minLat: Number(dataset.measurements[0].coordinates[1]),
      maxLon: Number(dataset.measurements[0].coordinates[0]),
      maxLat: Number(dataset.measurements[0].coordinates[1]),
    },
  );
  const routeGeometry = {
    type: "LineString",
    coordinates: [
      [bounds.minLon, bounds.minLat],
      [bounds.maxLon, bounds.maxLat],
    ],
  };

  // Make the import idempotent.
  // Re-running replaces only this prototype dataset.
  await prisma.measurement.deleteMany({
    where: { resultId },
  });

  await prisma.resultRevision.deleteMany({
    where: { id: revisionId },
  });

  await prisma.missionResult.deleteMany({
    where: { id: resultId },
  });

  await prisma.mission.deleteMany({
    where: { id: missionId },
  });

  await prisma.mission.create({
    data: {
      id: missionId,
      name: "Prototype Signal Quality Dataset",
      state: "COMPLETED",
      droneId: "prototype",
      earliestStart: capturedAt,
      createdAt: capturedAt,
      routeHistory: {
        create: {
          id: routeId,
          revision: 1,
          geometry: routeGeometry,
          createdAt: capturedAt,
        },
      },
      result: {
        create: {
          id: resultId,
          deviceId: "prototype",
          uploadedAt: capturedAt,
        },
      },
    },
  });

  await prisma.mission.update({
    where: { id: missionId },
    data: { activeRouteId: routeId },
  });

  const batchSize = 1000;

  for (
    let offset = 0;
    offset < dataset.measurements.length;
    offset += batchSize
  ) {
    const batch = dataset.measurements.slice(offset, offset + batchSize);

    await prisma.measurement.createMany({
      data: batch.map((m: any, index: number) => ({
        id: `prototype-sq-${String(offset + index + 1).padStart(6, "0")}`,
        resultId,
        capturedAt: new Date(capturedAt.getTime() + (offset + index) * 1000),
        longitude: Number(m.coordinates[0]),
        latitude: Number(m.coordinates[1]),
        source: "prototype-synthetic",
        rawObservations: {
          signalQuality: Number(m.value),
        },
      })),
    });
  }

  // Empty rejection list => all imported measurements are approved.
  await prisma.resultRevision.create({
    data: {
      id: revisionId,
      resultId,
      revision: 1,
      rejectedMeasurementIds: [],
      finalizedAt: capturedAt,
      createdAt: capturedAt,
    },
  });

  await prisma.missionResult.update({
    where: { id: resultId },
    data: {
      activeRevisionId: revisionId,
    },
  });

  console.log(
    `Imported ${dataset.measurements.length.toLocaleString()} measurements.`,
  );
  console.log(`Source: ${dataPath}`);
  console.log(`Mission: ${missionId}`);
  console.log(`Result: ${resultId}`);
} finally {
  await prisma.$disconnect();
}
