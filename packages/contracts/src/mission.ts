export type MissionId = string & { readonly __brand: 'MissionId' };
export type DroneId = string & { readonly __brand: 'DroneId' };
export type RouteRevisionId = string & { readonly __brand: 'RouteRevisionId' };
export type MissionState = 'DRAFT' | 'PLANNED' | 'DISPATCHED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
export type FailureReason = 'MISSED_DISPATCH' | 'EXECUTION_FAILED' | 'DATA_INVALID';

export interface LineStringGeometry {
  readonly type: 'LineString';
  readonly coordinates: readonly (readonly [number, number])[];
}

export interface RouteRevision {
  readonly id: RouteRevisionId;
  readonly revision: number;
  readonly geometry: LineStringGeometry;
  readonly createdAt: string;
}

export interface Mission {
  readonly id: MissionId;
  readonly name: string;
  readonly state: MissionState;
  readonly droneId: DroneId;
  readonly earliestStart: string;
  readonly dispatchDeadline: string | null;
  readonly activeRoute: RouteRevision;
  readonly routeHistory: readonly RouteRevision[];
  readonly failureReason: FailureReason | null;
  readonly derivedFrom: MissionId | null;
}

export interface CreateMissionCommand {
  readonly name: string;
  readonly droneId: DroneId;
  readonly earliestStart: string;
  readonly dispatchDeadline: string | null;
  readonly geometry: LineStringGeometry;
}
export interface UpdateDraftMissionCommand {
  readonly name?: string;
  readonly droneId?: DroneId;
  readonly earliestStart?: string;
  readonly dispatchDeadline?: string | null;
  readonly geometry?: LineStringGeometry;
}
export interface MissionQuery {
  readonly state?: MissionState;
  readonly droneId?: DroneId;
}
export interface MissionApi {
  list(query?: MissionQuery): Promise<readonly Mission[]>;
  get(id: MissionId): Promise<Mission>;
  create(command: CreateMissionCommand): Promise<Mission>;
  updateDraft(id: MissionId, command: UpdateDraftMissionCommand): Promise<Mission>;
  plan(id: MissionId, key: string): Promise<Mission>;
  cancel(id: MissionId, key: string): Promise<Mission>;
  deriveFromFailure(id: MissionId, key: string): Promise<Mission>;
}
