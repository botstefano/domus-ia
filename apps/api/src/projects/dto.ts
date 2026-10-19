import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export const STYLES = ['modern', 'minimalist', 'classic', 'mediterranean', 'industrial', 'nordic'] as const;
export const STATUSES = ['draft', 'designing', 'review', 'approved', 'finished', 'archived'] as const;
export const APPROVAL_STATUSES = ['pending', 'approved', 'rejected', 'changes_requested'] as const;

export class SetbacksDto {
  @IsNumber()
  @Min(0)
  front!: number;

  @IsNumber()
  @Min(0)
  back!: number;

  @IsNumber()
  @Min(0)
  left!: number;

  @IsNumber()
  @Min(0)
  right!: number;
}

export class TerrainDto {
  @IsNumber()
  @Min(3)
  @Max(200)
  width!: number;

  @IsNumber()
  @Min(3)
  @Max(200)
  depth!: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => SetbacksDto)
  setbacks?: SetbacksDto;

  @IsOptional()
  @IsIn(['north', 'south', 'east', 'west'])
  orientation?: 'north' | 'south' | 'east' | 'west';

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(45)
  slope?: number;
}

export class CreateProjectDto {
  @IsString()
  @MinLength(3)
  name!: string;

  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsString()
  clientName?: string;

  @IsOptional()
  @IsString()
  clientEmail?: string;

  @IsOptional()
  @IsString()
  clientPhone?: string;

  @IsIn(STYLES)
  style!: (typeof STYLES)[number];

  @IsInt()
  @Min(1)
  @Max(3)
  levels!: number;

  @IsInt()
  @Min(0)
  @Max(8)
  bedrooms!: number;

  @IsInt()
  @Min(1)
  @Max(6)
  bathrooms!: number;

  @IsInt()
  @Min(0)
  @Max(3)
  parkingSpaces!: number;

  @IsInt()
  @Min(1)
  @Max(12)
  familySize!: number;

  @IsNumber()
  @Min(10000)
  budget!: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  features?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  notes?: string[];

  @ValidateNested()
  @Type(() => TerrainDto)
  terrain!: TerrainDto;
}

export class InstructionDto {
  @IsString()
  @MinLength(3)
  text!: string;
}

export class UpdateStatusDto {
  @IsIn(STATUSES)
  status!: (typeof STATUSES)[number];
}

export class ApprovalDto {
  @IsInt()
  @Min(1)
  version!: number;

  @IsIn(APPROVAL_STATUSES)
  status!: (typeof APPROVAL_STATUSES)[number];

  @IsOptional()
  @IsString()
  comments?: string;
}

export class CreateClientDto {
  @IsString()
  @MinLength(3)
  fullName!: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class RestoreDto {
  @IsInt()
  @Min(1)
  version!: number;
}
