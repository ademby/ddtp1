import { Injectable } from '@nestjs/common';
import { PrismaMissionResultRepository } from './mission-result-repository.js';
import { DomainEvents } from '../common/domain-events.js';
import type { ReviewResultRevisionCommand, UploadMissionResultCommand } from '@drone-drive/contracts/mission-result';
import type { MissionId } from '@drone-drive/contracts/mission';

@Injectable()
export class MissionResultService {
  constructor(
    private readonly repository: PrismaMissionResultRepository,
    private readonly events: DomainEvents,
  ) {}

  get(missionId: string) { return this.repository.get(missionId as MissionId); }

  upload(missionId: string, command: UploadMissionResultCommand, key: string) {
    return this.repository.upload(missionId as MissionId, command, key);
  }

  async review(missionId: string, command: ReviewResultRevisionCommand, key: string) {
    const result = await this.repository.review(missionId as MissionId, command, key);
    // Only finalization changes the approved-measurement set Signal Quality reads. Emitted as an
    // event (ADR-0007) rather than calling SignalQualityService directly, so this module doesn't
    // need to know Signal Quality exists.
    if (command.finalize) this.events.emitResultRevisionFinalized({ missionId });
    return result;
  }

  approvedMeasurements(missionId: string) {
    return this.repository.approvedMeasurements(missionId as MissionId);
  }
}
