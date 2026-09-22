import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';
import { DomainEvents } from './domain-events.js';

/** Shared kernel: infra and cross-module primitives with no feature of their own. Global so
 *  MissionModule / MissionResultModule / SignalQualityModule don't each need to re-import it. */
@Global()
@Module({
  providers: [PrismaService, DomainEvents],
  exports: [PrismaService, DomainEvents],
})
export class CommonModule {}
