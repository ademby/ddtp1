import type {
  CreateMissionCommand, Mission, MissionApi, MissionId, MissionQuery,
  DroneId, LineStringGeometry, RouteRevision, RouteRevisionId, UpdateDraftMissionCommand,
} from '@drone-drive/contracts/mission';

import { missionId } from '../domain/missionIds.js';
export type {
  CreateMissionCommand, Mission, MissionApi, MissionId, MissionQuery,
  DroneId, LineStringGeometry, RouteRevision, RouteRevisionId, UpdateDraftMissionCommand,
  MissionState, FailureReason,
} from '@drone-drive/contracts/mission';

function hasValidRoute(geometry: LineStringGeometry): boolean {
  return geometry.coordinates.length >= 2;
}

function canUpdateDraft(mission: Mission): boolean {
  return mission.state === 'DRAFT';
}

function assertValidRoute(geometry: LineStringGeometry): void {
  if (!hasValidRoute(geometry)) {
    throw new Error('A mission route must contain at least two coordinates.');
  }
}

export class MockMissionApi implements MissionApi {
  private readonly missions = new Map<MissionId, Mission>();
  private readonly idempotentCommands = new Map<string, Mission>();
  private nextId = 1;
  private nextRouteRevision = 1;

  async list(query: MissionQuery = {}): Promise<readonly Mission[]> {
    return [...this.missions.values()].filter((mission) => (
      (!query.state || mission.state === query.state)
      && (!query.droneId || mission.droneId === query.droneId)
    ));
  }

  async get(id: MissionId): Promise<Mission> {
    const mission = this.missions.get(id);
    if (!mission) throw new Error(`Mission not found: ${id}`);
    return mission;
  }

  async create(command: CreateMissionCommand): Promise<Mission> {
    assertValidRoute(command.geometry);
    const now = new Date().toISOString();
    const route = this.createRouteRevision(command.geometry, now);
    const mission: Mission = {
      id: missionId(`mission-${this.nextId++}`),
      name: command.name,
      state: 'DRAFT',
      droneId: command.droneId,
      earliestStart: command.earliestStart,
      dispatchDeadline: command.dispatchDeadline,
      activeRoute: route,
      routeHistory: [route],
      failureReason: null,
      derivedFrom: null,
    };
    this.missions.set(mission.id, mission);
    return mission;
  }

  async updateDraft(id: MissionId, command: UpdateDraftMissionCommand): Promise<Mission> {
    const mission = await this.get(id);
    if (!canUpdateDraft(mission)) {
      throw new Error('Only draft missions can be edited.');
    }

    const route = command.geometry
      ? this.createRouteRevision(command.geometry, new Date().toISOString())
      : mission.activeRoute;
    if (command.geometry) assertValidRoute(command.geometry);

    const updated: Mission = {
      ...mission,
      name: command.name ?? mission.name,
      droneId: command.droneId ?? mission.droneId,
      earliestStart: command.earliestStart ?? mission.earliestStart,
      dispatchDeadline: command.dispatchDeadline === undefined
        ? mission.dispatchDeadline
        : command.dispatchDeadline,
      activeRoute: route,
      routeHistory: command.geometry ? [...mission.routeHistory, route] : mission.routeHistory,
    };
    this.missions.set(id, updated);
    return updated;
  }

  async plan(id: MissionId, idempotencyKey: string): Promise<Mission> {
    return this.executeIdempotent(idempotencyKey, async () => {
      const mission = await this.get(id);
      if (mission.state !== 'DRAFT') throw new Error('Only draft missions can be planned.');
      const planned = { ...mission, state: 'PLANNED' as const };
      this.missions.set(id, planned);
      return planned;
    });
  }

  async cancel(id: MissionId, idempotencyKey: string): Promise<Mission> {
    return this.executeIdempotent(idempotencyKey, async () => {
      const mission = await this.get(id);
      if (mission.state === 'COMPLETED' || mission.state === 'FAILED' || mission.state === 'CANCELLED') {
        throw new Error('A terminal mission cannot be cancelled.');
      }
      const cancelled = { ...mission, state: 'CANCELLED' as const };
      this.missions.set(id, cancelled);
      return cancelled;
    });
  }

  async deriveFromFailure(id: MissionId, idempotencyKey: string): Promise<Mission> {
    return this.executeIdempotent(idempotencyKey, async () => {
      const source = await this.get(id);
      if (source.state !== 'FAILED') throw new Error('Only failed missions can be derived.');
      const now = new Date().toISOString();
      const route = this.createRouteRevision(source.activeRoute.geometry, now);
      const derived: Mission = {
        ...source,
        id: missionId(`mission-${this.nextId++}`),
        state: 'DRAFT',
        activeRoute: route,
        routeHistory: [route],
        failureReason: null,
        derivedFrom: source.id,
      };
      this.missions.set(derived.id, derived);
      return derived;
    });
  }

  private createRouteRevision(geometry: LineStringGeometry, createdAt: string): RouteRevision {
    return {
      id: `route-${this.nextRouteRevision++}` as RouteRevisionId,
      revision: this.nextRouteRevision - 1,
      geometry,
      createdAt,
    };
  }

  private async executeIdempotent(
    key: string,
    operation: () => Promise<Mission>,
  ): Promise<Mission> {
    const previous = this.idempotentCommands.get(key);
    if (previous) return previous;
    const result = await operation();
    this.idempotentCommands.set(key, result);
    return result;
  }
}
