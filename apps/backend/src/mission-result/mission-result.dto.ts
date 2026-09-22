import { Type } from 'class-transformer';
import {
  ArrayMinSize, IsArray, IsBoolean, IsNotEmpty, IsNumber, IsObject, IsString, ValidateNested,
} from 'class-validator';

export class UploadMeasurementDto {
  @IsString()
  @IsNotEmpty()
  capturedAt!: string;

  @IsNumber()
  longitude!: number;

  @IsNumber()
  latitude!: number;

  @IsString()
  @IsNotEmpty()
  source!: string;

  @IsObject()
  kpis!: Record<string, number>;
}

export class UploadMissionResultDto {
  @IsString()
  @IsNotEmpty()
  deviceId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => UploadMeasurementDto)
  measurements!: readonly UploadMeasurementDto[];
}

export class ReviewResultRevisionDto {
  @IsArray()
  rejectedMeasurementIds!: readonly string[];

  @IsBoolean()
  finalize!: boolean;
}
