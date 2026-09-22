import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { CommonModule } from './common/common.module.js';
import { MissionModule } from './mission/mission.module.js';
import { MissionResultModule } from './mission-result/mission-result.module.js';
import { SignalQualityModule } from './signal-quality/signal-quality.module.js';

@Module({
  imports: [CommonModule, MissionModule, MissionResultModule, SignalQualityModule],
  controllers: [HealthController],
})
export class AppModule {}
