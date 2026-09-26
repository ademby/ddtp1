import type { Mission } from '@drone-drive/contracts/mission';
import type { MissionResult } from '@drone-drive/contracts/mission-result';
import type { MissionEditorMode } from '../workflows/mission/MissionEditor.js';
import {
  MissionOperationsView,
  type MissionFormData,
  type MissionOperationsViewCallbacks,
} from '../workflows/mission/MissionOperationsView.js';
import { HeatmapOperationsView } from '../workflows/heatmap/HeatmapOperationsView.js';
import type { SignalQualityPalette } from '../workflows/heatmap/SignalQualityPalette.js';

export interface OperationsPanelCallbacks extends MissionOperationsViewCallbacks {
  onToggleKpi(): void;
  onRefreshKpi(): void;
  onPaletteChange(palette: SignalQualityPalette): void;
  onPaletteReset(): void;
}

type PanelView = 'home' | 'missions' | 'editor' | 'review' | 'heatmap';

export default class OperationsPanel {
  readonly element: HTMLElement;
  private readonly viewTitle: HTMLElement;
  private readonly views: Record<PanelView, HTMLElement>;
  private readonly missionView: MissionOperationsView;
  private readonly heatmapView: HeatmapOperationsView;

  constructor(callbacks: OperationsPanelCallbacks, initialPalette: SignalQualityPalette) {
    this.element = document.createElement('aside');
    this.element.className = 'operations-panel mission-panel';
    /*html*/
    this.element.innerHTML = `
      <div class="panel-header">
        <div><span class="panel-kicker">Drone Drive Test</span><h2 class="panel-title">Operations</h2></div>
        <div class="panel-header-actions">
          <button class="icon-button collapse-panel" type="button" aria-label="Retract panel">−</button>
          <button class="icon-button close-panel" type="button" aria-label="Hide panel">×</button>
        </div>
      </div>
      <div class="panel-body">
        <section class="panel-view panel-home">
          <p class="panel-intro">Choose an operations workspace.</p>
          <div class="panel-groups">
            <div class="panel-group">
              <h3>Missions</h3>
              <button class="panel-nav-card missions-nav" type="button"><strong>Mission control</strong><span>Create, edit, and review flight plans</span></button>
            </div>
            <div class="panel-group">
              <h3>Heatmap</h3>
              <button class="panel-nav-card heatmap-nav" type="button"><strong>Signal quality</strong><span>Show coverage strength on the map</span></button>
            </div>
          </div>
        </section>
        <section class="panel-view panel-missions hidden">
          <div class="view-toolbar"><button class="back-button" type="button">← Overview</button><span class="view-status">Mission register</span></div>
          <div class="mission-actions"><button class="primary new-mission" type="button">New mission</button></div>
          <div class="mission-list"></div>
        </section>
        <section class="panel-view panel-editor hidden">
          <div class="view-toolbar"><button class="back-button" type="button">← Missions</button><span class="view-status">Mission editor</span></div>
          <div class="mission-editor">
            <div class="editor-heading"><h3>Mission details</h3></div>
            <label>Name<input name="name" type="text" placeholder="Mission name"></label>
            <label>Earliest start<input name="start" type="datetime-local"></label>
            <label>Dispatch deadline (optional)<input name="deadline" type="datetime-local"></label>
            <label>Assigned drone<select name="drone">
              <option value="drone-alpha">Drone Alpha</option>
              <option value="drone-bravo">Drone Bravo</option>
            </select></label>
            <div class="editor-tools">
              <button type="button" data-tool="draw">Create path</button>
              <button type="button" data-tool="modify">Modify</button>
              <button type="button" data-tool="translate">Translate</button>
              <button type="button" data-tool="undo">Undo</button>
              <button type="button" data-tool="redo">Redo</button>
            </div>
            <div class="editor-actions">
              <button class="secondary cancel" type="button">Back</button>
              <button class="danger cancel-mission hidden" type="button">Cancel mission</button>
              <button class="secondary retry-mission hidden" type="button">Retry as new mission</button>
              <button class="secondary plan" type="button">Plan mission</button>
              <button class="primary save" type="button">Save draft</button>
            </div>
          </div>
        </section>
        <section class="panel-view panel-review hidden">
          <div class="view-toolbar"><button class="back-button" type="button">← Missions</button><span class="view-status">Mission validation</span></div>
          <div class="mission-editor result-section">
            <div class="editor-heading review-heading">
              <h3 class="review-mission-name"></h3>
              <span class="review-state-badge"></span>
            </div>
            <p class="result-loading hidden">Loading result…</p>
            <p class="result-empty hidden">No result uploaded yet.</p>
            <p class="result-hint">Click a point to select it, shift-click to extend, Ctrl/Cmd-drag on the map to box-select.</p>
            <div class="result-toolbar hidden">
              <button class="secondary select-all-measurements" type="button">Select all</button>
              <button class="secondary invert-measurement-selection" type="button">Invert</button>
              <button class="secondary clear-measurement-selection" type="button">Clear</button>
              <button class="primary approve-selected-measurements" type="button">Approve selected</button>
              <button class="danger reject-selected-measurements" type="button">Reject selected</button>
            </div>
            <p class="selection-summary"></p>
            <ul class="result-measurements"></ul>
            <div class="result-actions">
              <button class="secondary save-review" type="button">Save review</button>
              <button class="primary finalize-review" type="button">Finalize revision</button>
            </div>
            <p class="result-status"></p>
          </div>
        </section>
        <section class="panel-view panel-heatmap hidden">
          <div class="view-toolbar"><button class="back-button" type="button">← Overview</button><span class="view-status">Coverage layer</span></div>
          <div class="feature-view">
            <h3>Signal quality</h3>
            <p>Compare coverage strength with the active map context.</p>
            <button class="primary toggle-kpi" type="button">Show signal quality</button>
            <button class="secondary refresh-kpi" type="button" title="Reload coverage data (measurements reviewed elsewhere aren't picked up automatically)">Refresh data</button>
            <div class="palette-editor">
              <div class="palette-editor-header"><h4>Color palette</h4><button class="secondary palette-reset" type="button">Reset</button></div>
              <div class="palette-stops"></div>
              <button class="secondary palette-add-stop" type="button">Add stop</button>
            </div>
          </div>
        </section>
      </div>
      <button class="panel-reopen" type="button" aria-label="Expand operations panel">Operations</button>`;

    document.body.appendChild(this.element);
    this.viewTitle = this.element.querySelector('.panel-title') as HTMLElement;
    this.views = {
      home: this.element.querySelector('.panel-home') as HTMLElement,
      missions: this.element.querySelector('.panel-missions') as HTMLElement,
      editor: this.element.querySelector('.panel-editor') as HTMLElement,
      review: this.element.querySelector('.panel-review') as HTMLElement,
      heatmap: this.element.querySelector('.panel-heatmap') as HTMLElement,
    };
    this.missionView = new MissionOperationsView(this.views.missions, this.views.editor, this.views.review, callbacks);
    this.heatmapView = new HeatmapOperationsView(this.views.heatmap, initialPalette, {
      onToggle: callbacks.onToggleKpi,
      onRefresh: callbacks.onRefreshKpi,
      onPaletteChange: callbacks.onPaletteChange,
      onPaletteReset: callbacks.onPaletteReset,
    });

    this.element.querySelector('.missions-nav')?.addEventListener('click', () => this.showView('missions'));
    this.element.querySelector('.heatmap-nav')?.addEventListener('click', () => this.showView('heatmap'));
    this.element.querySelectorAll('.panel-missions .back-button, .panel-heatmap .back-button')
      .forEach((button) => button.addEventListener('click', () => this.showView('home')));
    this.element.querySelector('.panel-reopen')?.addEventListener('click', () => this.element.classList.remove('retracted'));
    this.element.querySelector('.collapse-panel')?.addEventListener('click', () => this.element.classList.add('retracted'));
    this.element.querySelector('.close-panel')?.addEventListener('click', () => this.hidePanel());
  }

  renderMissions(missions: readonly Mission[], selectedId: string | null): void {
    this.missionView.renderMissions(missions, selectedId);
  }

  setEditor(mission: Mission | null, title: string): void {
    this.missionView.setEditor(mission, title);
    this.showView('editor');
  }

  showReview(mission: Mission): void {
    this.missionView.showReview(mission);
    this.showView('review');
  }

  setResult(result: MissionResult | null): void {
    this.missionView.setResult(result);
  }

  setMeasurementSelection(ids: readonly string[]): void {
    this.missionView.setMeasurementSelection(ids);
  }

  setMeasurementRejection(rejectedIds: readonly string[]): void {
    this.missionView.setMeasurementRejection(rejectedIds);
  }

  setResultStatusMessage(message: string): void {
    this.missionView.setResultStatusMessage(message);
  }

  setActiveTool(mode: MissionEditorMode): void {
    this.missionView.setActiveTool(mode);
  }

  showMissionList(): void { this.showView('missions'); }
  showHome(): void { this.showView('home'); }

  getFormData(): MissionFormData { return this.missionView.getFormData(); }

  showPanel(): void {
    this.element.classList.remove('hidden', 'retracted');
  }

  hidePanel(): void {
    this.element.classList.add('hidden');
  }

  private showView(view: PanelView): void {
    for (const [name, element] of Object.entries(this.views)) element.classList.toggle('hidden', name !== view);
    const titles: Record<PanelView, string> = {
      home: 'Operations',
      missions: 'Missions',
      editor: 'Mission editor',
      review: 'Mission validation',
      heatmap: 'Heatmap',
    };
    this.viewTitle.textContent = titles[view];
  }
}

export { OperationsPanel };
