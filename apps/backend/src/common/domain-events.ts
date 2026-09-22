import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'node:events';

/** Fired when a result revision is finalized — the only moment the approved-measurement set
 *  Signal Quality reads actually changes. See ADR-0007: this replaces MissionResultService
 *  calling SignalQualityService.invalidate() directly, which was the one edge making
 *  mission-result and signal-quality circular. */
export interface ResultRevisionFinalizedEvent {
  readonly missionId: string;
}

const RESULT_REVISION_FINALIZED = 'ResultRevisionFinalized';

/** Minimal in-process event bus (Node's built-in EventEmitter, DI-wrapped) so modules can react
 *  to what happened elsewhere without importing each other. Deliberately not @nestjs/event-emitter:
 *  one event type doesn't need a new dependency and its module-wide wiring. */
@Injectable()
export class DomainEvents {
  private readonly emitter = new EventEmitter();

  emitResultRevisionFinalized(event: ResultRevisionFinalizedEvent): void {
    this.emitter.emit(RESULT_REVISION_FINALIZED, event);
  }

  onResultRevisionFinalized(listener: (event: ResultRevisionFinalizedEvent) => void): void {
    this.emitter.on(RESULT_REVISION_FINALIZED, listener);
  }
}
