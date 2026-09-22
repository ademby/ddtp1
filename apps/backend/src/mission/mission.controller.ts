import { Body, Controller, Get, Headers, Param, Patch, Post, Query } from '@nestjs/common';
import { ClaimMissionDto, CreateMissionDto, MissionQueryDto, ReportMissionStatusDto, UpdateDraftMissionDto } from './mission.dto.js';
import { ApiError } from '../common/api-error.js';
import { MissionService } from './mission.service.js';

@Controller('missions')
export class MissionController {
  constructor(private readonly missions: MissionService) {}

  @Get()
  list(@Query() query: MissionQueryDto) {
    return this.missions.list({ state: query.state as never, droneId: query.droneId as never });
  }

  @Get(':id')
  get(@Param('id') id: string) { return this.missions.get(id); }

  @Post()
  create(@Body() command: CreateMissionDto) { return this.missions.create(command as never); }

  @Patch(':id')
  update(@Param('id') id: string, @Body() command: UpdateDraftMissionDto) {
    return this.missions.updateDraft(id, command as never);
  }

  @Post(':id/plan')
  plan(@Param('id') id: string, @Headers('idempotency-key') key?: string) {
    return this.missions.plan(id, this.requireKey(key));
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string, @Headers('idempotency-key') key?: string) {
    return this.missions.cancel(id, this.requireKey(key));
  }

  @Post(':id/derive')
  derive(@Param('id') id: string, @Headers('idempotency-key') key?: string) {
    return this.missions.derive(id, this.requireKey(key));
  }

  @Post(':id/claim')
  claim(@Param('id') id: string, @Body() command: ClaimMissionDto, @Headers('idempotency-key') key?: string) {
    return this.missions.claim(id, command.droneId, this.requireKey(key));
  }

  @Post(':id/status')
  reportStatus(@Param('id') id: string, @Body() command: ReportMissionStatusDto, @Headers('idempotency-key') key?: string) {
    return this.missions.reportStatus(id, command.droneId, command.status, this.requireKey(key), command.failureReason);
  }

  private requireKey(key?: string): string {
    if (!key?.trim()) throw new ApiError('Idempotency-Key header is required.');
    return key;
  }
}
