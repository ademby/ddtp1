import { Injectable } from '@nestjs/common';
import { PrismaMissionRepository } from './mission-repository.js';
import type { CreateMissionCommand, DroneId, MissionId, MissionQuery, UpdateDraftMissionCommand } from '@drone-drive/contracts/mission';

@Injectable()
export class MissionService {
  constructor(private readonly repository: PrismaMissionRepository) {}

  list(query: MissionQuery) { return this.repository.list(query); }
  get(id: string) { return this.repository.get(id as MissionId); }
  create(command: CreateMissionCommand) { return this.repository.create(command); }
  updateDraft(id: string, command: UpdateDraftMissionCommand) { return this.repository.updateDraft(id as MissionId, command); }
  plan(id: string, key: string) { return this.repository.plan(id as MissionId, key); }
  cancel(id: string, key: string) { return this.repository.cancel(id as MissionId, key); }
  derive(id: string, key: string) { return this.repository.deriveFromFailure(id as MissionId, key); }

  claim(id: string, droneId: string, key: string) {
    return this.repository.claim(id as MissionId, droneId as DroneId, key);
  }

  reportStatus(id: string, droneId: string, status: 'RUNNING' | 'COMPLETED' | 'FAILED', key: string, failureReason?: 'EXECUTION_FAILED' | 'DATA_INVALID') {
    return this.repository.reportStatus(id as MissionId, droneId as DroneId, status, key, failureReason);
  }
}
