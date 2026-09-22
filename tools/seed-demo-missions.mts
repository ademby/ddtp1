import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../apps/backend/src/generated/prisma/client.js";


const connectionString =
  "postgresql://postgres:postgres@localhost:5432/drone_drive";
if (!connectionString) throw new Error("DATABASE_URL is not set.");

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const NOW = new Date();
const hours = (n: number) => new Date(NOW.getTime() + n * 3_600_000);
const days = (n: number) => hours(n * 24);

const DRONES = { alpha: "drone-alpha", bravo: "drone-bravo" } as const;

// Deterministic PRNG (mulberry32) so re-seeding produces the same synthetic values every time.
function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface RouteSpec {
  readonly missionId: string;
  readonly geometry: { readonly type: "LineString"; readonly coordinates: [number, number][] };
}

const METERS_PER_DEG_LAT = 111320;
function metersPerDegLon(lat: number): number {
  return METERS_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
}
function segLengthMeters(a: [number, number], b: [number, number]): number {
  const mPerLon = metersPerDegLon((a[1] + b[1]) / 2);
  return Math.hypot((b[0] - a[0]) * mPerLon, (b[1] - a[1]) * METERS_PER_DEG_LAT);
}
function clampSignal(value: number): number {
  return Math.min(99, Math.max(15, value));
}

/**
 * A drive-test path shaped like real streets: straight blocks with corner turns, rather than
 * radial noise, covering a realistic single-mission distance within a small area of a city.
 */
function streetRoute(
  missionId: string,
  anchor: [number, number],
  seed: number,
  targetLengthMeters = 2200,
): RouteSpec {
  const random = rng(seed);
  const [lon0, lat0] = anchor;
  const points: [number, number][] = [[lon0, lat0]];
  let lon = lon0;
  let lat = lat0;
  let heading = random() * Math.PI * 2;
  let covered = 0;
  while (covered < targetLengthMeters) {
    const blockMeters = 90 + random() * 110; // one street block
    heading += (random() - 0.5) * (Math.PI / 3); // gentle turn onto the next block
    if (random() < 0.15) heading += (random() < 0.5 ? 1 : -1) * (Math.PI / 2.2); // occasional street corner
    lon += (Math.sin(heading) * blockMeters) / metersPerDegLon(lat);
    lat += (Math.cos(heading) * blockMeters) / METERS_PER_DEG_LAT;
    points.push([Number(lon.toFixed(6)), Number(lat.toFixed(6))]);
    covered += blockMeters;
  }
  return { missionId, geometry: { type: "LineString", coordinates: points } };
}

interface MeasurementSeed {
  readonly capturedAt: Date;
  readonly longitude: number;
  readonly latitude: number;
  readonly source: string;
  readonly kpis: { signalQuality: number };
}

/**
 * Samples the route every `stepMeters` of actual path distance, the way an onboard GNSS/radio
 * logger would. Signal Quality is a smoothed walk seeded from the area's baseline rather than
 * independent noise per point, so two nearby samples never differ sharply.
 */
function measurementsAlongRoute(
  route: RouteSpec,
  baseline: number,
  startedAt: Date,
  seed: number,
  stepMeters = 10,
  speedMetersPerSecond = 8,
): MeasurementSeed[] {
  const random = rng(seed);
  const coords = route.geometry.coordinates;
  const out: MeasurementSeed[] = [];
  let value = baseline;
  let distIntoSeg = 0;

  for (let i = 0; i < coords.length - 1; i += 1) {
    const [lon0, lat0] = coords[i];
    const [lon1, lat1] = coords[i + 1];
    const segMeters = segLengthMeters([lon0, lat0], [lon1, lat1]);
    if (segMeters === 0) continue;
    const mPerLon = metersPerDegLon((lat0 + lat1) / 2);

    while (distIntoSeg <= segMeters) {
      const t = distIntoSeg / segMeters;
      const jitterMeters = (random() - 0.5) * 3; // a couple of metres of GNSS jitter, not tens
      value = clampSignal(value + (random() - 0.5) * 2.4);
      out.push({
        capturedAt: new Date(startedAt.getTime() + (out.length * stepMeters * 1000) / speedMetersPerSecond),
        longitude: Number((lon0 + (lon1 - lon0) * t + jitterMeters / mPerLon).toFixed(6)),
        latitude: Number((lat0 + (lat1 - lat0) * t + jitterMeters / METERS_PER_DEG_LAT).toFixed(6)),
        source: "onboard-gnss",
        kpis: { signalQuality: Math.round(value * 100) / 100 },
      });
      distIntoSeg += stepMeters;
    }
    distIntoSeg -= segMeters;
  }
  return out;
}

async function createMission(options: {
  id: string;
  name: string;
  state: "DRAFT" | "PLANNED" | "DISPATCHED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
  droneId: string;
  earliestStart: Date;
  dispatchDeadline?: Date | null;
  failureReason?: "MISSED_DISPATCH" | "EXECUTION_FAILED" | "DATA_INVALID";
  derivedFromId?: string;
  route: RouteSpec;
  createdAt: Date;
  result?: {
    deviceId: string;
    measurements: MeasurementSeed[];
    review?: { rejectedMeasurementIds: string[]; finalized: boolean };
  };
}): Promise<void> {
  const routeId = `${options.id}-route`;
  await prisma.mission.create({
    data: {
      id: options.id,
      name: options.name,
      state: options.state,
      droneId: options.droneId,
      earliestStart: options.earliestStart,
      dispatchDeadline: options.dispatchDeadline ?? null,
      failureReason: options.failureReason ?? null,
      derivedFromId: options.derivedFromId,
      createdAt: options.createdAt,
      routeHistory: {
        create: { id: routeId, revision: 1, geometry: options.route.geometry, createdAt: options.createdAt },
      },
    },
  });
  await prisma.mission.update({ where: { id: options.id }, data: { activeRouteId: routeId } });

  if (!options.result) return;
  const resultId = `${options.id}-result`;
  await prisma.missionResult.create({
    data: {
      id: resultId,
      missionId: options.id,
      deviceId: options.result.deviceId,
      uploadedAt: options.earliestStart,
      measurements: {
        create: options.result.measurements.map((measurement, index) => ({
          id: `${options.id}-m-${String(index + 1).padStart(5, "0")}`,
          capturedAt: measurement.capturedAt,
          longitude: measurement.longitude,
          latitude: measurement.latitude,
          source: measurement.source,
          kpis: measurement.kpis,
        })),
      },
    },
  });

  if (!options.result.review) return;
  const revisionId = `${options.id}-revision-1`;
  await prisma.resultRevision.create({
    data: {
      id: revisionId,
      resultId,
      revision: 1,
      rejectedMeasurementIds: options.result.review.rejectedMeasurementIds,
      finalizedAt: options.result.review.finalized ? options.earliestStart : null,
    },
  });
  if (options.result.review.finalized) {
    await prisma.missionResult.update({ where: { id: resultId }, data: { activeRevisionId: revisionId } });
  }
}

const demoIds = [
  "demo-draft-1",
  "demo-draft-2",
  "demo-planned-1",
  "demo-planned-missed",
  "demo-dispatched-1",
  "demo-running-1",
  "demo-completed-no-result",
  "demo-completed-unreviewed",
  "demo-completed-reviewed-not-finalized",
  "demo-completed-finalized",
  "demo-failed-missed-dispatch",
  "demo-failed-execution",
  "demo-failed-data-invalid",
  "demo-cancelled-from-draft",
  "demo-cancelled-from-planned",
  "demo-derived-retry",
  "prototype-drive-test",
];

try {
  // Idempotent: wipe this script's own missions before recreating them. Cascade deletes
  // (RouteRevision, MissionResult -> Measurement/ResultRevision) handle the rest.
  await prisma.mission.deleteMany({ where: { id: { in: demoIds } } });

  // --- The "realistic" secondary prototype: its own independently generated street path and
  // measurement series (never a slice of seed-signal-quality.mts's regional dataset), sized
  // like a single drive-test rather than a whole regional survey. ---
  const driveTestStart = days(-4);
  const driveTestRoute = streetRoute("prototype-drive-test", [10.238863, 36.834981], 101, 3000);
  const driveTestMeasurements = measurementsAlongRoute(driveTestRoute, 90, driveTestStart, 102);
  // A handful of low-quality readings rejected on review, rest approved and finalized.
  const rejectedDriveTest = driveTestMeasurements
    .map((measurement, index) => ({ measurement, index }))
    .filter(({ measurement }) => measurement.kpis.signalQuality < 35)
    .slice(0, 15)
    .map(({ index }) => `prototype-drive-test-m-${String(index + 1).padStart(5, "0")}`);

  await createMission({
    id: "prototype-drive-test",
    name: "Berges du Lac corridor drive test",
    state: "COMPLETED",
    droneId: DRONES.alpha,
    earliestStart: driveTestStart,
    createdAt: driveTestStart,
    route: driveTestRoute,
    result: {
      deviceId: "device-lac2-001",
      measurements: driveTestMeasurements,
      review: { rejectedMeasurementIds: rejectedDriveTest, finalized: true },
    },
  });

  // --- The rest of the catalog: one mission per state/phase worth demonstrating. ---
  const anchors: Record<string, [number, number]> = {
    draft1: [10.1815, 36.8065],
    draft2: [10.2282, 36.8397],
    planned1: [10.2897, 36.8425],
    plannedMissed: [10.0369, 36.8065],
    dispatched1: [10.0982, 36.8081],
    running1: [10.1939, 36.8625],
    completedNoResult: [10.3411, 36.8697],
    completedUnreviewed: [10.325, 36.879],
    completedReviewedNotFinalized: [10.2166, 36.8969],
    completedFinalized: [10.3297, 36.8528],
    failedMissedDispatch: [10.2733, 36.7538],
    failedExecution: [10.2469, 36.7469],
    failedDataInvalid: [10.3097, 36.7386],
    cancelledFromDraft: [10.0982, 36.8081],
    cancelledFromPlanned: [10.1131, 36.6136],
  };

  await createMission({
    id: "demo-draft-1",
    name: "Menzah district resurvey",
    state: "DRAFT",
    droneId: DRONES.alpha,
    earliestStart: days(2),
    createdAt: hours(-6),
    route: streetRoute("demo-draft-1", anchors.draft1, 1),
  });

  await createMission({
    id: "demo-draft-2",
    name: "Airport corridor draft",
    state: "DRAFT",
    droneId: DRONES.bravo,
    earliestStart: days(3),
    dispatchDeadline: days(3.2),
    createdAt: hours(-2),
    route: streetRoute("demo-draft-2", anchors.draft2, 2),
  });

  await createMission({
    id: "demo-planned-1",
    name: "Lac 2 fiber corridor",
    state: "PLANNED",
    droneId: DRONES.alpha,
    earliestStart: days(1),
    dispatchDeadline: days(2),
    createdAt: days(-1),
    route: streetRoute("demo-planned-1", anchors.planned1, 3),
  });

  // Deadline already passed while still unclaimed: the dispatch sweeper (MissionDispatchSweeper)
  // will flip this to FAILED/MISSED_DISPATCH on its next run.
  await createMission({
    id: "demo-planned-missed",
    name: "Bardo loop (missed dispatch window)",
    state: "PLANNED",
    droneId: DRONES.bravo,
    earliestStart: days(-2),
    dispatchDeadline: hours(-1),
    createdAt: days(-3),
    route: streetRoute("demo-planned-missed", anchors.plannedMissed, 4),
  });

  await createMission({
    id: "demo-dispatched-1",
    name: "Manouba ring road",
    state: "DISPATCHED",
    droneId: DRONES.alpha,
    earliestStart: hours(-1),
    dispatchDeadline: hours(3),
    createdAt: days(-1),
    route: streetRoute("demo-dispatched-1", anchors.dispatched1, 5),
  });

  await createMission({
    id: "demo-running-1",
    name: "Ariana north sweep",
    state: "RUNNING",
    droneId: DRONES.bravo,
    earliestStart: hours(-0.5),
    dispatchDeadline: hours(2),
    createdAt: days(-1),
    route: streetRoute("demo-running-1", anchors.running1, 6),
  });

  await createMission({
    id: "demo-completed-no-result",
    name: "Sidi Bou Said coastal pass",
    state: "COMPLETED",
    droneId: DRONES.alpha,
    earliestStart: hours(-4),
    dispatchDeadline: hours(-1),
    createdAt: days(-1),
    route: streetRoute("demo-completed-no-result", anchors.completedNoResult, 7),
  });

  const unreviewedRoute = streetRoute("demo-completed-unreviewed", anchors.completedUnreviewed, 8);
  await createMission({
    id: "demo-completed-unreviewed",
    name: "La Marsa boulevard",
    state: "COMPLETED",
    droneId: DRONES.bravo,
    earliestStart: days(-1),
    dispatchDeadline: hours(-20),
    createdAt: days(-2),
    route: unreviewedRoute,
    result: {
      deviceId: "device-lamarsa-002",
      measurements: measurementsAlongRoute(unreviewedRoute, 79, days(-1), 9), // La Marsa: coastal residential/urban
    },
  });

  const reviewedNotFinalRoute = streetRoute("demo-completed-reviewed-not-finalized", anchors.completedReviewedNotFinalized, 10);
  const reviewedNotFinalMeasurements = measurementsAlongRoute(reviewedNotFinalRoute, 85, days(-1.5), 11); // Ennasr: dense commercial strip
  await createMission({
    id: "demo-completed-reviewed-not-finalized",
    name: "Ennasr commercial strip",
    state: "COMPLETED",
    droneId: DRONES.alpha,
    earliestStart: days(-1.5),
    dispatchDeadline: hours(-30),
    createdAt: days(-2.5),
    route: reviewedNotFinalRoute,
    result: {
      deviceId: "device-ennasr-003",
      measurements: reviewedNotFinalMeasurements,
      review: {
        rejectedMeasurementIds: [
          "demo-completed-reviewed-not-finalized-m-00003",
          "demo-completed-reviewed-not-finalized-m-00047",
        ],
        finalized: false,
      },
    },
  });

  const finalizedRoute = streetRoute("demo-completed-finalized", anchors.completedFinalized, 12);
  const finalizedMeasurements = measurementsAlongRoute(finalizedRoute, 74, days(-3), 13); // Carthage: low-rise heritage site
  await createMission({
    id: "demo-completed-finalized",
    name: "Carthage heritage loop",
    state: "COMPLETED",
    droneId: DRONES.bravo,
    earliestStart: days(-3),
    dispatchDeadline: hours(-70),
    createdAt: days(-4),
    route: finalizedRoute,
    result: {
      deviceId: "device-carthage-004",
      measurements: finalizedMeasurements,
      review: {
        rejectedMeasurementIds: ["demo-completed-finalized-m-00010"],
        finalized: true,
      },
    },
  });

  await createMission({
    id: "demo-failed-missed-dispatch",
    name: "Rades industrial zone",
    state: "FAILED",
    failureReason: "MISSED_DISPATCH",
    droneId: DRONES.alpha,
    earliestStart: days(-2),
    dispatchDeadline: days(-1.9),
    createdAt: days(-3),
    route: streetRoute("demo-failed-missed-dispatch", anchors.failedMissedDispatch, 14),
  });

  await createMission({
    id: "demo-failed-execution",
    name: "Megrine crossing",
    state: "FAILED",
    failureReason: "EXECUTION_FAILED",
    droneId: DRONES.bravo,
    earliestStart: days(-1),
    dispatchDeadline: hours(-22),
    createdAt: days(-2),
    route: streetRoute("demo-failed-execution", anchors.failedExecution, 15),
  });

  await createMission({
    id: "demo-failed-data-invalid",
    name: "Hammam Lif corniche",
    state: "FAILED",
    failureReason: "DATA_INVALID",
    droneId: DRONES.alpha,
    earliestStart: hours(-8),
    dispatchDeadline: hours(-5),
    createdAt: days(-1),
    route: streetRoute("demo-failed-data-invalid", anchors.failedDataInvalid, 16),
  });

  await createMission({
    id: "demo-cancelled-from-draft",
    name: "Manouba depot test (cancelled)",
    state: "CANCELLED",
    droneId: DRONES.alpha,
    earliestStart: days(5),
    createdAt: days(-1),
    route: streetRoute("demo-cancelled-from-draft", anchors.cancelledFromDraft, 17),
  });

  await createMission({
    id: "demo-cancelled-from-planned",
    name: "Zone industrielle Mghira (cancelled)",
    state: "CANCELLED",
    droneId: DRONES.bravo,
    earliestStart: days(4),
    dispatchDeadline: days(4.2),
    createdAt: days(-2),
    route: streetRoute("demo-cancelled-from-planned", anchors.cancelledFromPlanned, 18),
  });

  // Retry draft derived from the MISSED_DISPATCH failure above, reusing its route as a
  // starting point (as MissionWorkflow.retry() / deriveFromFailure would).
  const failedRoute = streetRoute("demo-failed-missed-dispatch", anchors.failedMissedDispatch, 14);
  await createMission({
    id: "demo-derived-retry",
    name: "Rades industrial zone (retry)",
    state: "DRAFT",
    droneId: DRONES.alpha,
    earliestStart: days(1),
    createdAt: hours(-1),
    derivedFromId: "demo-failed-missed-dispatch",
    route: { missionId: "demo-derived-retry", geometry: failedRoute.geometry },
  });

  console.log(`Seeded ${demoIds.length} demo missions (1 realistic drive test + ${demoIds.length - 1} state/phase examples).`);
} finally {
  await prisma.$disconnect();
}
