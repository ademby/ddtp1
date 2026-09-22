import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { ApiError } from '../common/api-error.js';
import { ReviewResultRevisionDto, UploadMissionResultDto } from './mission-result.dto.js';
import { MissionResultService } from './mission-result.service.js';

@Controller('missions/:missionId/result')
export class MissionResultController {
  constructor(private readonly results: MissionResultService) {}

  @Get()
  get(@Param('missionId') missionId: string) { return this.results.get(missionId); }

  @Get('approved-measurements')
  approvedMeasurements(@Param('missionId') missionId: string) {
    return this.results.approvedMeasurements(missionId);
  }

  @Post()
  upload(
    @Param('missionId') missionId: string,
    @Body() command: UploadMissionResultDto,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.results.upload(missionId, command as never, this.requireKey(key));
  }

  @Post('revisions')
  review(
    @Param('missionId') missionId: string,
    @Body() command: ReviewResultRevisionDto,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.results.review(missionId, command as never, this.requireKey(key));
  }

  private requireKey(key?: string): string {
    if (!key?.trim()) throw new ApiError('Idempotency-Key header is required.');
    return key;
  }
}
