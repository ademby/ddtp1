import { Injectable } from "@nestjs/common";
import type {
  Mission as PrismaMission,
  RouteRevision as PrismaRouteRevision,
} from "../generated/prisma/client.js";
import { PrismaService } from "../common/prisma.service.js";
import { ApiError } from "../common/api-error.js";
import type {
  CreateMissionCommand,
  DroneId,
  LineStringGeometry,
  Mission,
  MissionApi,
  MissionId,
  MissionQuery,
  RouteRevision,
  RouteRevisionId,
  UpdateDraftMissionCommand,
} from "@drone-drive/contracts/mission";

const terminalStates = new Set(["COMPLETED", "FAILED", "CANCELLED"]);
function routeIsValid(route: LineStringGeometry): boolean {
  return (
    route?.type === "LineString" &&
    Array.isArray(route.coordinates) &&
    route.coordinates.length >= 2 &&
    route.coordinates.every(
      (point) =>
        Array.isArray(point) &&
        point.length === 2 &&
        point.every(
          (value) => typeof value === "number" && Number.isFinite(value),
        ),
    )
  );
}

type MissionWithRoutes = PrismaMission & {
  activeRoute: PrismaRouteRevision | null;
  routeHistory: PrismaRouteRevision[];
};

@Injectable()
export class PrismaMissionRepository implements MissionApi {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: MissionQuery = {}): Promise<readonly Mission[]> {
    const missions = await this.prisma.mission.findMany({
      where: { state: query.state, droneId: query.droneId },
      include: {
        activeRoute: true,
        routeHistory: { orderBy: { revision: "asc" } },
      },
      orderBy: { createdAt: "asc" },
    });
    return missions.map((mission) => this.toContract(mission));
  }

  async get(id: MissionId): Promise<Mission> {
    const mission = await this.prisma.mission.findUnique({
      where: { id },
      include: {
        activeRoute: true,
        routeHistory: { orderBy: { revision: "asc" } },
      },
    });
    if (!mission) throw new ApiError(`Mission not found: ${id}`, 404);
    return this.toContract(mission);
  }

  async create(command: CreateMissionCommand): Promise<Mission> {
    this.assertCommand(command);
    const mission = await this.prisma.$transaction(async (tx) => {
      const created = await tx.mission.create({
        data: {
          name: command.name,
          droneId: command.droneId,
          earliestStart: new Date(command.earliestStart),
          dispatchDeadline: command.dispatchDeadline
            ? new Date(command.dispatchDeadline)
            : null,
          routeHistory: {
            create: {
              revision: 1,
              geometry: JSON.parse(JSON.stringify(command.geometry)),
            },
          },
        },
      });
      const route = await tx.routeRevision.findFirstOrThrow({
        where: { missionId: created.id },
      });
      await tx.mission.update({
        where: { id: created.id },
        data: { activeRouteId: route.id },
      });
      return created;
    });
    return this.get(mission.id as MissionId);
  }

  async updateDraft(
    id: MissionId,
    command: UpdateDraftMissionCommand,
  ): Promise<Mission> {
    const current = await this.get(id);
    if (current.state !== "DRAFT")
      throw new ApiError("Only draft missions can be edited.");
    if (command.geometry && !routeIsValid(command.geometry))
      throw new ApiError(
        "A mission route must contain at least two coordinates.",
      );
    const updated = await this.prisma.$transaction(async (tx) => {
      let activeRouteId = current.activeRoute.id;
      if (command.geometry) {
        const route = await tx.routeRevision.create({
          data: {
            missionId: id,
            revision: current.routeHistory.length + 1,
            geometry: JSON.parse(JSON.stringify(command.geometry)),
          },
        });
        activeRouteId = route.id as RouteRevisionId;
      }
      return tx.mission.update({
        where: { id },
        data: {
          name: command.name,
          droneId: command.droneId,
          earliestStart: command.earliestStart
            ? new Date(command.earliestStart)
            : undefined,
          dispatchDeadline:
            command.dispatchDeadline === undefined
              ? undefined
              : command.dispatchDeadline
                ? new Date(command.dispatchDeadline)
                : null,
          activeRouteId,
        },
        include: {
          activeRoute: true,
          routeHistory: { orderBy: { revision: "asc" } },
        },
      });
    });
    return this.toContract(updated);
  }

  async plan(id: MissionId, key: string): Promise<Mission> {
    return this.commandOnce(id, key, "PLANNED");
  }
  async cancel(id: MissionId, key: string): Promise<Mission> {
    return this.commandOnce(id, key, "CANCELLED");
  }

  async claim(id: MissionId, droneId: DroneId, key: string): Promise<Mission> {
    const existing = await this.prisma.idempotencyKey.findUnique({
      where: { key },
    });
    if (existing) return this.get(existing.missionId as MissionId);
    const current = await this.get(id);
    if (current.state !== "PLANNED")
      throw new ApiError("Only planned missions can be claimed.");
    if (current.droneId !== droneId)
      throw new ApiError("Mission is assigned to a different drone.", 403);
    if (
      current.dispatchDeadline &&
      new Date(current.dispatchDeadline).getTime() < Date.now()
    ) {
      throw new ApiError("The dispatch deadline has passed.", 409);
    }
    return this.transitionOnce(id, key, { state: "DISPATCHED" });
  }

  async reportStatus(
    id: MissionId,
    droneId: DroneId,
    status: "RUNNING" | "COMPLETED" | "FAILED",
    key: string,
    failureReason?: "EXECUTION_FAILED" | "DATA_INVALID",
  ): Promise<Mission> {
    const existing = await this.prisma.idempotencyKey.findUnique({
      where: { key },
    });
    if (existing) return this.get(existing.missionId as MissionId);
    const current = await this.get(id);
    if (current.droneId !== droneId)
      throw new ApiError("Mission is assigned to a different drone.", 403);
    if (status === "RUNNING" && current.state !== "DISPATCHED")
      throw new ApiError("Only dispatched missions can start running.");
    if (status === "COMPLETED" && current.state !== "RUNNING")
      throw new ApiError("Only running missions can complete.");
    if (status === "FAILED") {
      if (current.state !== "DISPATCHED" && current.state !== "RUNNING")
        throw new ApiError("Only dispatched or running missions can fail.");
      if (
        failureReason !== "EXECUTION_FAILED" &&
        failureReason !== "DATA_INVALID"
      )
        throw new ApiError(
          "A reported failure requires EXECUTION_FAILED or DATA_INVALID.",
        );
    }
    return this.transitionOnce(id, key, {
      state: status,
      failureReason: status === "FAILED" ? failureReason! : undefined,
    });
  }

  /** System sweep: fails planned missions whose dispatch deadline has passed unclaimed. Not exposed over HTTP. */
  async sweepMissedDispatch(now: Date = new Date()): Promise<number> {
    const result = await this.prisma.mission.updateMany({
      where: { state: "PLANNED", dispatchDeadline: { lt: now } },
      data: { state: "FAILED", failureReason: "MISSED_DISPATCH" },
    });
    return result.count;
  }

  private async transitionOnce(
    id: MissionId,
    key: string,
    data: {
      state: "DISPATCHED" | "RUNNING" | "COMPLETED" | "FAILED";
      failureReason?: "EXECUTION_FAILED" | "DATA_INVALID";
    },
  ): Promise<Mission> {
    const result = await this.prisma.$transaction(async (tx) => {
      const mission = await tx.mission.update({
        where: { id },
        data,
        include: { activeRoute: true, routeHistory: true },
      });
      await tx.idempotencyKey.create({ data: { key, missionId: id } });
      return mission;
    });
    return this.toContract(result);
  }

  async deriveFromFailure(id: MissionId, key: string): Promise<Mission> {
    const existing = await this.prisma.idempotencyKey.findUnique({
      where: { key },
      include: {
        mission: { include: { activeRoute: true, routeHistory: true } },
      },
    });
    if (existing) return this.get(existing.missionId as MissionId);
    const source = await this.get(id);
    if (source.state !== "FAILED")
      throw new ApiError("Only failed missions can be derived.");
    const result = await this.prisma.$transaction(async (tx) => {
      const mission = await tx.mission.create({
        data: {
          name: source.name,
          droneId: source.droneId,
          earliestStart: new Date(source.earliestStart),
          dispatchDeadline: source.dispatchDeadline
            ? new Date(source.dispatchDeadline)
            : null,
          derivedFromId: id,
          routeHistory: {
            create: {
              revision: 1,
              geometry: JSON.parse(JSON.stringify(source.activeRoute.geometry)),
            },
          },
        },
        include: { activeRoute: true, routeHistory: true },
      });
      await tx.idempotencyKey.create({ data: { key, missionId: mission.id } });
      return mission;
    });
    return this.get(result.id as MissionId);
  }

  private async commandOnce(
    id: MissionId,
    key: string,
    state: "PLANNED" | "CANCELLED",
  ): Promise<Mission> {
    const existing = await this.prisma.idempotencyKey.findUnique({
      where: { key },
    });
    if (existing) return this.get(existing.missionId as MissionId);
    const current = await this.get(id);
    if (state === "PLANNED" && current.state !== "DRAFT")
      throw new ApiError("Only draft missions can be planned.");
    if (state === "CANCELLED" && terminalStates.has(current.state))
      throw new ApiError("A terminal mission cannot be cancelled.");
    const result = await this.prisma.$transaction(async (tx) => {
      const mission = await tx.mission.update({
        where: { id },
        data: { state },
        include: { activeRoute: true, routeHistory: true },
      });
      await tx.idempotencyKey.create({ data: { key, missionId: id } });
      return mission;
    });
    return this.toContract(result);
  }

  private assertCommand(command: CreateMissionCommand): void {
    if (
      !command ||
      !command.name.trim() ||
      !command.droneId ||
      !command.earliestStart ||
      (command.dispatchDeadline !== null &&
        typeof command.dispatchDeadline !== "string") ||
      !routeIsValid(command.geometry)
    ) {
      throw new ApiError("Invalid mission command.");
    }
  }

  private toContract(mission: MissionWithRoutes): Mission {
    if (!mission.activeRoute)
      throw new ApiError(`Mission has no active route: ${mission.id}`, 500);
    const route = (value: PrismaRouteRevision): RouteRevision => ({
      id: value.id as RouteRevisionId,
      revision: value.revision,
      geometry: value.geometry as unknown as LineStringGeometry,
      createdAt: value.createdAt.toISOString(),
    });
    return {
      id: mission.id as MissionId,
      name: mission.name,
      state: mission.state,
      droneId: mission.droneId as DroneId,
      earliestStart: mission.earliestStart.toISOString(),
      dispatchDeadline: mission.dispatchDeadline?.toISOString() ?? null,
      activeRoute: route(mission.activeRoute),
      routeHistory: mission.routeHistory.map(route),
      failureReason: mission.failureReason,
      derivedFrom: mission.derivedFromId as MissionId | null,
    };
  }
}

export function isMissionState(value: string | null): boolean {
  return (
    value === null ||
    [
      "DRAFT",
      "PLANNED",
      "DISPATCHED",
      "RUNNING",
      "COMPLETED",
      "FAILED",
      "CANCELLED",
    ].includes(value)
  );
}
export function asMissionId(value: string): MissionId {
  return value as MissionId;
}
export function asDroneId(value: string): DroneId {
  return value as DroneId;
}
