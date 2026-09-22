import type { MissionId } from './mission.js';

export type MeasurementId = string & { readonly __brand: 'MeasurementId' };
export type MissionResultId = string & { readonly __brand: 'MissionResultId' };
export type ResultRevisionId = string & { readonly __brand: 'ResultRevisionId' };

/** An immutable observation: timestamp, location, source/device, and KPI values. */
export interface Measurement {
  readonly id: MeasurementId;
  readonly capturedAt: string;
  readonly longitude: number;
  readonly latitude: number;
  readonly source: string;
  readonly kpis: Readonly<Record<string, number>>;
}

/** An immutable validation view of a mission result: which measurements are accepted/rejected, and when finalized. */
export interface ResultRevision {
  readonly id: ResultRevisionId;
  readonly revision: number;
  readonly rejectedMeasurementIds: readonly MeasurementId[];
  readonly finalizedAt: string | null;
  readonly createdAt: string;
}

/** The complete dataset uploaded for one mission execution. */
export interface MissionResult {
  readonly id: MissionResultId;
  readonly missionId: MissionId;
  readonly deviceId: string;
  readonly uploadedAt: string;
  readonly measurements: readonly Measurement[];
  readonly activeRevision: ResultRevision | null;
  readonly revisionHistory: readonly ResultRevision[];
}

/** A measurement included by the active finalized result revision. */
export type ApprovedMeasurement = Measurement;

export interface UploadMeasurementCommand {
  readonly capturedAt: string;
  readonly longitude: number;
  readonly latitude: number;
  readonly source: string;
  readonly kpis: Readonly<Record<string, number>>;
}

export interface UploadMissionResultCommand {
  readonly deviceId: string;
  readonly measurements: readonly UploadMeasurementCommand[];
}

/** Operator validation: reject a set of measurements, optionally finalizing the revision. */
export interface ReviewResultRevisionCommand {
  readonly rejectedMeasurementIds: readonly MeasurementId[];
  readonly finalize: boolean;
}

export interface MissionResultApi {
  get(missionId: MissionId): Promise<MissionResult>;
  upload(missionId: MissionId, command: UploadMissionResultCommand, key: string): Promise<MissionResult>;
  review(missionId: MissionId, command: ReviewResultRevisionCommand, key: string): Promise<MissionResult>;
  approvedMeasurements(missionId: MissionId): Promise<readonly ApprovedMeasurement[]>;
}
