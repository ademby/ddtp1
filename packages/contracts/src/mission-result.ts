import type { MissionId } from './mission.js';

export type MeasurementId = string & { readonly __brand: 'MeasurementId' };
export type MissionResultId = string & { readonly __brand: 'MissionResultId' };
export type ResultRevisionId = string & { readonly __brand: 'ResultRevisionId' };

/**
 * An immutable raw observation: timestamp, location, source/device, and the raw network
 * readings collected at that point.
 *
 * `rawObservations` contains the numeric values as collected by the drone (e.g. RSRP, RSRQ,
 * signal quality). They are raw; derived KPI projections are computed server-side after result
 * finalization and are never stored on the measurement itself.
 */
export interface Measurement {
  readonly id: MeasurementId;
  readonly capturedAt: string;
  readonly longitude: number;
  readonly latitude: number;
  readonly source: string;
  readonly rawObservations: Readonly<Record<string, number>>;
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
  /** The active finalized revision, or null if no revision has been finalized yet. */
  readonly activeRevision: ResultRevision | null;
  readonly revisionHistory: readonly ResultRevision[];
}

export interface UploadMeasurementCommand {
  readonly capturedAt: string;
  readonly longitude: number;
  readonly latitude: number;
  readonly source: string;
  readonly rawObservations: Readonly<Record<string, number>>;
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
  /** Returns the measurements included by the active finalized revision, or empty if not yet finalized. */
  approvedMeasurements(missionId: MissionId): Promise<readonly Measurement[]>;
}
