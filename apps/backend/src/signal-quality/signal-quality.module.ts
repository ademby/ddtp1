import { Module } from '@nestjs/common';
import { SignalQualityController } from './signal-quality.controller.js';
import { SignalQualityService } from './signal-quality.service.js';
import { MissionResultModule } from '../mission-result/mission-result.module.js';

@Module({
  // Only direction of the former cycle that remains: reads approved measurements from
  // MissionResultModule's exported repository. See ADR-0007.
  imports: [MissionResultModule],
  controllers: [SignalQualityController],
  providers: [SignalQualityService],
})
export class SignalQualityModule {}
