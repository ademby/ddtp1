import { Module } from '@nestjs/common';
import { MissionResultController } from './mission-result.controller.js';
import { MissionResultService } from './mission-result.service.js';
import { PrismaMissionResultRepository } from './mission-result-repository.js';

@Module({
  controllers: [MissionResultController],
  providers: [PrismaMissionResultRepository, MissionResultService],
  // Exported so SignalQualityModule can read approved measurements — the one direction of the
  // former mission-result <-> signal-quality cycle that stays a real import (ADR-0007).
  exports: [PrismaMissionResultRepository],
})
export class MissionResultModule {}
