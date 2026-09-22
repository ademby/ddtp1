import { Type } from 'class-transformer';
import { IsArray, IsIn, IsNotEmpty, IsObject, IsOptional, IsString, Validate, ValidateNested, ValidatorConstraint, type ValidatorConstraintInterface, type ValidationArguments } from 'class-validator';

@ValidatorConstraint({ name: 'lineStringCoordinates', async: false })
class LineStringCoordinatesConstraint implements ValidatorConstraintInterface {
  validate(value: unknown) {
    return Array.isArray(value) && value.length >= 2 &&
      value.every((point) => Array.isArray(point) && point.length === 2 &&
        point.every((coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate)));
  }
  defaultMessage(_args: ValidationArguments) { return 'coordinates must contain at least two numeric [x, y] pairs'; }
}

export class GeometryDto {
  @IsString()
  @IsIn(['LineString'])
  type!: 'LineString';

  @IsArray()
  @Validate(LineStringCoordinatesConstraint)
  coordinates!: readonly [number, number][];
}

export class CreateMissionDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  droneId!: string;

  @IsString()
  @IsNotEmpty()
  earliestStart!: string;

  @IsOptional()
  @IsString()
  dispatchDeadline!: string | null;

  @IsObject()
  @ValidateNested()
  @Type(() => GeometryDto)
  geometry!: GeometryDto;
}

export class UpdateDraftMissionDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  droneId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  earliestStart?: string;

  @IsOptional()
  @IsString()
  dispatchDeadline?: string | null;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => GeometryDto)
  geometry?: GeometryDto;
}

export class ClaimMissionDto {
  @IsString()
  @IsNotEmpty()
  droneId!: string;
}

export class ReportMissionStatusDto {
  @IsString()
  @IsNotEmpty()
  droneId!: string;

  @IsIn(['RUNNING', 'COMPLETED', 'FAILED'])
  status!: 'RUNNING' | 'COMPLETED' | 'FAILED';

  @IsOptional()
  @IsIn(['EXECUTION_FAILED', 'DATA_INVALID'])
  failureReason?: 'EXECUTION_FAILED' | 'DATA_INVALID';
}

export class MissionQueryDto {
  @IsOptional()
  @IsIn(['DRAFT', 'PLANNED', 'DISPATCHED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED'])
  state?: string;

  @IsOptional()
  @IsString()
  droneId?: string;
}
