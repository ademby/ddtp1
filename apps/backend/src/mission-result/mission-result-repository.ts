import { Injectable } from "@nestjs/common";
import type {
  Measurement as PrismaMeasurement,
  MissionResult as PrismaMissionResult,
  ResultRevision as PrismaResultRevision,
} from "../generated/prisma/client.js";
import { ApiError } from "../common/api-error.js";
import { PrismaService } from "../common/prisma.service.js";
import type { MissionId } from "@drone-drive/contracts/mission";
import type {
  Measurement,
  MeasurementId,
  MissionResult,
  MissionResultApi,
  MissionResultId,
  ResultRevision,
  ResultRevisionId,
  ReviewResultRevisionCommand,
  UploadMissionResultCommand,
} from "@drone-drive/contracts/mission-result";

type MissionResultWithGraph = PrismaMissionResult & {
  measurements: PrismaMeasurement[];
  activeRevision: PrismaResultRevision | null;
  revisionHistory: PrismaResultRevision[];
};

const include = {
  measurements: { orderBy: { capturedAt: "asc" as const } },
  activeRevision: true,
  revisionHistory: { orderBy: { revision: "asc" as const } },
};

@Injectable()
export class PrismaMissionResultRepository implements MissionResultApi {
  constructor(private readonly prisma: PrismaService) {}

  async get(missionId: MissionId): Promise<MissionResult> {
    const result = await this.prisma.missionResult.findUnique({
      where: { missionId },
      include,
    });
    if (!result)
      throw new ApiError(`Mission result not found: ${missionId}`, 404);
    return this.toContract(result);
  }

  async upload(
    missionId: MissionId,
    command: UploadMissionResultCommand,
    key: string,
  ): Promise<MissionResult> {
    const existing = await this.prisma.idempotencyKey.findUnique({
      where: { key },
    });
    if (existing) return this.get(existing.missionId as MissionId);

    const mission = await this.prisma.mission.findUnique({
      where: { id: missionId },
    });
    if (!mission)
      throw new ApiError(`Mission not found: ${missionId}`, 404);
    if (mission.state !== "COMPLETED")
      throw new ApiError(
        "Only completed missions can receive a result upload.",
      );
    const alreadyUploaded = await this.prisma.missionResult.findUnique({
      where: { missionId },
    });
    if (alreadyUploaded)
      throw new ApiError(
        "A result has already been uploaded for this mission.",
        409,
      );
    if (!command.measurements.length)
      throw new ApiError(
        "A mission result must include at least one measurement.",
      );

    const created = await this.prisma.$transaction(async (tx) => {
      const result = await tx.missionResult.create({
        data: {
          missionId,
          deviceId: command.deviceId,
          measurements: {
            create: command.measurements.map((measurement) => ({
              capturedAt: new Date(measurement.capturedAt),
              longitude: measurement.longitude,
              latitude: measurement.latitude,
              source: measurement.source,
              kpis: JSON.parse(JSON.stringify(measurement.rawObservations)),
            })),
          },
        },
      });
      await tx.idempotencyKey.create({ data: { key, missionId } });
      return result;
    });
    return this.get(created.missionId as MissionId);
  }

  async review(
    missionId: MissionId,
    command: ReviewResultRevisionCommand,
    key: string,
  ): Promise<MissionResult> {
    const existing = await this.prisma.idempotencyKey.findUnique({
      where: { key },
    });
    if (existing) return this.get(existing.missionId as MissionId);

    const current = await this.get(missionId);
    const validIds = new Set(
      current.measurements.map((measurement) => measurement.id as string),
    );
    for (const rejectedId of command.rejectedMeasurementIds) {
      if (!validIds.has(rejectedId as string))
        throw new ApiError(`Unknown measurement: ${rejectedId}`);
    }

    await this.prisma.$transaction(async (tx) => {
      const revision = await tx.resultRevision.create({
        data: {
          resultId: current.id,
          revision: current.revisionHistory.length + 1,
          rejectedMeasurementIds: JSON.parse(
            JSON.stringify(command.rejectedMeasurementIds),
          ),
          finalizedAt: command.finalize ? new Date() : null,
        },
      });
      await tx.missionResult.update({
        where: { id: current.id },
        data: { activeRevisionId: revision.id },
      });
      await tx.idempotencyKey.create({ data: { key, missionId } });
    });
    return this.get(missionId);
  }

  async approvedMeasurements(
    missionId: MissionId,
  ): Promise<readonly Measurement[]> {
    const result = await this.get(missionId);
    if (!result.activeRevision?.finalizedAt) return [];
    const rejected = new Set(
      result.activeRevision.rejectedMeasurementIds as readonly string[],
    );
    return result.measurements.filter(
      (measurement) => !rejected.has(measurement.id as string),
    );
  }

  /** All measurements across every mission whose active revision is finalized, minus that revision's rejections. */
  async allApprovedMeasurements(): Promise<readonly Measurement[]> {
    const results = await this.prisma.missionResult.findMany({
      where: { activeRevision: { finalizedAt: { not: null } } },
      include,
    });
    const approved: Measurement[] = [];
    for (const result of results) {
      const graph = result as MissionResultWithGraph;
      const rejected = new Set(
        (graph.activeRevision?.rejectedMeasurementIds as
          | string[]
          | undefined) ?? [],
      );
      for (const raw of graph.measurements) {
        if (!rejected.has(raw.id)) approved.push(this.measurement(raw));
      }
    }
    return approved;
  }

  private measurement(value: PrismaMeasurement): Measurement {
    return {
      id: value.id as MeasurementId,
      capturedAt: value.capturedAt.toISOString(),
      longitude: value.longitude,
      latitude: value.latitude,
      source: value.source,
      rawObservations: value.kpis as Record<string, number>,
    };
  }

  private toContract(result: MissionResultWithGraph): MissionResult {
    const revision = (value: PrismaResultRevision): ResultRevision => ({
      id: value.id as ResultRevisionId,
      revision: value.revision,
      rejectedMeasurementIds: value.rejectedMeasurementIds as MeasurementId[],
      finalizedAt: value.finalizedAt?.toISOString() ?? null,
      createdAt: value.createdAt.toISOString(),
    });
    return {
      id: result.id as MissionResultId,
      missionId: result.missionId as MissionId,
      deviceId: result.deviceId,
      uploadedAt: result.uploadedAt.toISOString(),
      measurements: result.measurements.map((value) => this.measurement(value)),
      activeRevision: result.activeRevision
        ? revision(result.activeRevision)
        : null,
      revisionHistory: result.revisionHistory.map(revision),
    };
  }
}
