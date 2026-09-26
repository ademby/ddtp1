import { Module } from '@nestjs/common';
import { MissionController } from './mission.controller.js';
import { MissionService } from './mission.service.js';
import { PrismaMissionRepository } from './mission-repository.js';
import { MissionDispatchSweeper } from './mission-dispatch-sweeper.js';

@Module({
  controllers: [MissionController],
  providers: [PrismaMissionRepository, MissionService, MissionDispatchSweeper],
})
export class MissionModule {}
