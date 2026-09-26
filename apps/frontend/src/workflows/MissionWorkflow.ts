import type { MissionApi, Mission, MissionId, DroneId } from '@drone-drive/contracts/mission';
import { droneId, missionId } from '../domain/missionIds.js';
import type { MissionEditorMode } from '../mission/MissionEditor.js';
import type { MissionResult, MissionResultApi } from '@drone-drive/contracts/mission-result';

export interface MissionFormData {
  readonly name: string;
  readonly droneId: DroneId;
  readonly earliestStart: string;
  readonly dispatchDeadline: string | null;
}

export interface MissionWorkflowView {
  renderMissions(missions: readonly Mission[], selectedId: string | null): void;
  setEditor(mission: Mission | null, title: string): void;
  showReview(mission: Mission): void;
  setActiveTool(mode: MissionEditorMode): void;
  showMissionList(): void;
  setResult(result: MissionResult | null): void;
  setResultStatusMessage(message: string): void;
}

export interface MissionRouteEditor {
  startNew(): void;
  load(mission: Mission): void;
  startDraw(): void;
  startModify(): void;
  startTranslate(): void;
  undo(): void;
  redo(): void;
  stop(): void;
  hasValidGeometry(): boolean;
  getGeometry(): Mission['activeRoute']['geometry'];
}

export interface MissionMapWorkspace {
  fitMission(id: MissionId): void;
  clearMission(): void;
  setEditorMode(mode: MissionEditorMode): void;
  showMeasurements(result: MissionResult): void;
  clearMeasurements(): void;
}

export interface MissionWorkflowOptions {
  readonly mapWorkspace: MissionMapWorkspace;
  readonly missionApi: MissionApi;
  readonly missionResultApi?: MissionResultApi;
  readonly missionEditor: MissionRouteEditor;
  readonly view: MissionWorkflowView;
  readonly setAdminSelectionEnabled: (enabled: boolean) => void;
}

export class MissionWorkflow {
  private readonly mapWorkspace: MissionMapWorkspace;
  private readonly missionApi: MissionApi;
  private readonly missionResultApi: MissionResultApi | undefined;
  private readonly missionEditor: MissionRouteEditor;
  private readonly view: MissionWorkflowView;
  private readonly setAdminSelectionEnabled: (enabled: boolean) => void;
  private missions: Mission[] = [];
  private selectedMissionId: string | null = null;
  private editingMissionId: MissionId | null = null;

  constructor(options: MissionWorkflowOptions) {
    this.mapWorkspace = options.mapWorkspace;
    this.missionApi = options.missionApi;
    this.missionResultApi = options.missionResultApi;
    this.missionEditor = options.missionEditor;
    this.view = options.view;
    this.setAdminSelectionEnabled = options.setAdminSelectionEnabled;
  }

  async load(): Promise<void> {
    this.missions = [...await this.missionApi.list()];
    this.renderMissionList();
  }

  create(): void {
    this.setAdminSelectionEnabled(false);
    const now = new Date(Date.now() + 15 * 60_000).toISOString();
    this.editingMissionId = null;
    this.selectedMissionId = null;
    this.missionEditor.startNew();
    this.mapWorkspace.clearMeasurements();
    const draft: Mission = {
      id: missionId('draft'),
      name: '',
      state: 'DRAFT',
      droneId: droneId('drone-alpha'),
      earliestStart: now,
      dispatchDeadline: null,
      activeRoute: {
        id: 'route-draft' as Mission['activeRoute']['id'],
        revision: 0,
        geometry: { type: 'LineString', coordinates: [] },
        createdAt: now,
      },
      routeHistory: [],
      failureReason: null,
      derivedFrom: null,
    };
    this.view.setEditor(draft, 'New mission');
    this.renderMissionList();
  }

  select(id: string): void {
    const mission = this.missions.find((item) => item.id === id);
    if (!mission) return;
    this.setAdminSelectionEnabled(false);
    this.editingMissionId = mission.id;
    this.selectedMissionId = mission.id;
    this.missionEditor.load(mission);
    this.mapWorkspace.clearMeasurements();
    // Validation (reviewing an uploaded result) is a distinct screen from CRUD (editing a
    // draft/planned mission): a mission only ever has a result once it's COMPLETED or FAILED.
    if (mission.state === 'COMPLETED' || mission.state === 'FAILED') {
      this.view.showReview(mission);
    } else {
      this.view.setEditor(mission, 'Edit mission');
    }
    this.renderMissionList();
    if (mission.activeRoute.geometry.coordinates.length > 1) {
      this.mapWorkspace.fitMission(mission.id);
    }
    void this.loadResult(mission);
  }

  private async loadResult(mission: Mission): Promise<void> {
    if (!this.missionResultApi) return;
    if (mission.state !== 'COMPLETED' && mission.state !== 'FAILED') return;
    try {
      const result = await this.missionResultApi.get(mission.id);
      if (this.editingMissionId !== mission.id) return;
      this.view.setResult(result);
      this.mapWorkspace.showMeasurements(result);
    } catch {
      if (this.editingMissionId === mission.id) this.view.setResult(null);
    }
  }

  /** Returns whether the revision was saved (callers may show advisory UI after finalize). */
  async saveReview(rejectedMeasurementIds: readonly string[], finalize: boolean): Promise<boolean> {
    if (!this.missionResultApi || !this.editingMissionId) return false;
    try {
      const result = await this.missionResultApi.review(
        this.editingMissionId,
        { rejectedMeasurementIds: rejectedMeasurementIds as never, finalize },
        `review-${this.editingMissionId}-${Date.now()}`,
      );
      this.view.setResult(result);
      this.mapWorkspace.showMeasurements(result);
      return true;
    } catch (error: unknown) {
      this.view.setResultStatusMessage(errorMessage(error, 'Failed to save review.'));
      return false;
    }
  }

  startDraw(): void {
    this.setAdminSelectionEnabled(false);
    this.missionEditor.startDraw();
  }

  startModify(): void {
    this.setAdminSelectionEnabled(false);
    this.missionEditor.startModify();
  }

  startTranslate(): void {
    this.setAdminSelectionEnabled(false);
    this.missionEditor.startTranslate();
  }

  undo(): void {
    this.missionEditor.undo();
  }

  redo(): void {
    this.missionEditor.redo();
  }

  handleEditorMode(mode: MissionEditorMode): void {
    this.view.setActiveTool(mode);
    this.mapWorkspace.setEditorMode(mode);
  }

  async save(data: MissionFormData): Promise<void> {
    if (!this.missionEditor.hasValidGeometry()) {
      window.alert('Create a route with at least two points before saving.');
      return;
    }

    try {
      if (this.editingMissionId) {
        const updated = await this.missionApi.updateDraft(this.editingMissionId, {
          name: data.name,
          droneId: data.droneId,
          earliestStart: data.earliestStart,
          dispatchDeadline: data.dispatchDeadline,
          geometry: this.missionEditor.getGeometry(),
        });
        this.missions = this.missions.map((mission) => mission.id === updated.id ? updated : mission);
        this.selectedMissionId = updated.id;
      } else {
        const created = await this.missionApi.create({
          name: data.name,
          droneId: data.droneId,
          earliestStart: data.earliestStart,
          dispatchDeadline: data.dispatchDeadline,
          geometry: this.missionEditor.getGeometry(),
        });
        this.missions = [created, ...this.missions];
        this.selectedMissionId = created.id;
        this.editingMissionId = created.id;
      }
      this.missionEditor.stop();
      this.setAdminSelectionEnabled(true);
      this.renderMissionList();
      const saved = this.missions.find((mission) => mission.id === this.selectedMissionId);
      if (saved) {
        this.missionEditor.load(saved);
        this.view.setEditor(saved, 'Edit mission');
      }
    } catch (error: unknown) {
      window.alert(errorMessage(error, 'Failed to save mission.'));
    }
  }

  async plan(): Promise<void> {
    if (!this.editingMissionId) return;
    try {
      const planned = await this.missionApi.plan(
        this.editingMissionId,
        `plan-${this.editingMissionId}`,
      );
      this.missions = this.missions.map((mission) => mission.id === planned.id ? planned : mission);
      this.view.renderMissions(this.missions, this.selectedMissionId);
      this.view.setEditor(planned, 'Planned mission');
    } catch (error: unknown) {
      window.alert(errorMessage(error, 'Failed to plan mission.'));
    }
  }

  async cancelMission(): Promise<void> {
    if (!this.editingMissionId) return;
    try {
      const cancelled = await this.missionApi.cancel(
        this.editingMissionId,
        `cancel-${this.editingMissionId}`,
      );
      this.missions = this.missions.map((mission) => mission.id === cancelled.id ? cancelled : mission);
      this.view.setEditor(cancelled, 'Cancelled mission');
      this.renderMissionList();
    } catch (error: unknown) {
      window.alert(errorMessage(error, 'Failed to cancel mission.'));
    }
  }

  async retry(): Promise<void> {
    if (!this.editingMissionId) return;
    try {
      const derived = await this.missionApi.deriveFromFailure(
        this.editingMissionId,
        `derive-${this.editingMissionId}`,
      );
      this.missions = [derived, ...this.missions];
      this.editingMissionId = derived.id;
      this.selectedMissionId = derived.id;
      this.missionEditor.load(derived);
      this.view.setEditor(derived, 'New mission (retry)');
      this.renderMissionList();
    } catch (error: unknown) {
      window.alert(errorMessage(error, 'Failed to create a retry mission.'));
    }
  }

  cancel(): void {
    this.missionEditor.stop();
    this.setAdminSelectionEnabled(true);
    if (this.editingMissionId) {
      const mission = this.missions.find((item) => item.id === this.editingMissionId);
      if (mission) {
        this.missionEditor.load(mission);
        this.view.setEditor(mission, 'Edit mission');
        return;
      }
    }
    this.mapWorkspace.clearMission();
    this.selectedMissionId = null;
    this.editingMissionId = null;
    this.view.showMissionList();
    this.renderMissionList();
  }

  back(): void {
    this.missionEditor.stop();
    this.setAdminSelectionEnabled(true);
    this.mapWorkspace.clearMission();
    this.mapWorkspace.clearMeasurements();
    this.selectedMissionId = null;
    this.editingMissionId = null;
    this.view.showMissionList();
    this.renderMissionList();
  }

  private renderMissionList(): void {
    this.view.renderMissions(this.missions, this.selectedMissionId);
  }
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export default MissionWorkflow;
