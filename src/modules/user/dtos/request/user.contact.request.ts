import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UserContactListQueryDto {
  @ApiPropertyOptional({ example: 'mateus' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }) => value?.trim())
  q?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class UserContactCreateDto {
  @ApiPropertyOptional({ example: 'Mateus Cossa' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }) => value?.trim())
  displayName?: string;

  @ApiProperty({ example: 'mateus@example.com' })
  @IsEmail()
  @MaxLength(255)
  @Transform(({ value }) => value?.toLowerCase().trim())
  email: string;

  @ApiPropertyOptional({ example: '+258841234567' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  @Transform(({ value }) => value?.trim())
  phone?: string;
}

export class UserContactInviteDto {
  @ApiPropertyOptional({ example: 'Mateus Cossa' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }) => value?.trim())
  displayName?: string;

  @ApiProperty({ example: 'mateus@example.com' })
  @IsEmail()
  @MaxLength(255)
  @Transform(({ value }) => value?.toLowerCase().trim())
  email: string;
}
