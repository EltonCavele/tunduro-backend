import { faker } from '@faker-js/faker';
import { ApiProperty } from '@nestjs/swagger';
import { $Enums } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UserUpdateDto {
  @ApiProperty({
    example: faker.internet.email(),
    required: false,
  })
  @IsEmail()
  @IsOptional()
  @Transform(({ value }) => value?.toLowerCase().trim())
  email?: string;

  @ApiProperty({
    example: faker.person.firstName(),
    required: false,
  })
  @IsString()
  @IsOptional()
  @MinLength(2)
  @MaxLength(50)
  @Transform(({ value }) => value?.trim())
  firstName?: string;

  @ApiProperty({
    example: faker.person.lastName(),
    required: false,
  })
  @IsString()
  @IsOptional()
  @MinLength(2)
  @MaxLength(50)
  @Transform(({ value }) => value?.trim())
  lastName?: string;

  @ApiProperty({
    example: '+258841234567',
    required: false,
    nullable: true,
  })
  @IsString()
  @IsOptional()
  @Transform(({ value }) => value?.trim())
  phone?: string | null;

  @ApiProperty({
    example: faker.image.avatar(),
    required: false,
    nullable: true,
  })
  @IsUrl()
  @IsOptional()
  @Transform(({ value }) => value?.trim())
  avatarUrl?: string | null;

  @ApiProperty({
    example: 'BEGINNER',
    required: false,
    nullable: true,
  })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  @Transform(({ value }) => value?.trim())
  level?: string | null;

  @ApiProperty({
    enum: $Enums.Gender,
    required: false,
    nullable: true,
    example: $Enums.Gender.OTHER,
  })
  @IsEnum($Enums.Gender)
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toUpperCase().trim() : value
  )
  gender?: $Enums.Gender;

  @ApiProperty({
    example: 'Court A',
    required: false,
    nullable: true,
  })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  @Transform(({ value }) => value?.trim())
  favoriteCourt?: string | null;

  @ApiProperty({
    example: ['06:00-08:00', '18:00-20:00'],
    required: false,
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @Transform(({ value }) => {
    if (Array.isArray(value)) {
      return value.map(item => `${item}`.trim()).filter(Boolean);
    }
    if (typeof value === 'string') {
      return value
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);
    }
    return value;
  })
  preferredTimeSlots?: string[];

  @ApiProperty({
    example: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]',
    required: false,
    nullable: true,
  })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  @Transform(({ value }) => value?.trim())
  expoPushToken?: string | null;
}
