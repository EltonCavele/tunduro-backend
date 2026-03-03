import { faker } from '@faker-js/faker';
import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class ApiPaginatedRequestDto {
  @ApiProperty({
    example: 10,
    required: true,
    type: Number,
  })
  @IsInt()
  @IsNotEmpty()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit: number;

  @ApiProperty({
    example: 1,
    required: true,
    type: Number,
  })
  @IsInt()
  @IsNotEmpty()
  @Min(1)
  @Type(() => Number)
  page: number;

  @ApiProperty({
    required: false,
    type: String,
    example: faker.lorem.word(),
  })
  @IsString()
  @IsOptional()
  @Transform(({ value }) => value?.trim())
  search?: string;
}
