import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaMissionRepository } from './mission-repository.js';

/**
 * Fails PLANNED missions whose dispatch deadline has passed without a claim
 * (ADR: "Missed dispatch"). Runs on an interval rather than per-request so
 * mission reads stay simple queries.
 */
@Injectable()
export class MissionDispatchSweeper implements OnModuleInit, OnModuleDestroy {
  private readonly intervalMs = 10_000;
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly repository: PrismaMissionRepository) {}

  onModuleInit(): void {
    this.timer = setInterval(() => { void this.repository.sweepMissedDispatch(); }, this.intervalMs);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
