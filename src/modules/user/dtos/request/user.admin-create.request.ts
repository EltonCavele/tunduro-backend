import { faker } from '@faker-js/faker';
import { ApiProperty } from '@nestjs/swagger';
import { $Enums, Role } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UserAdminCreateDto {
  @ApiProperty({
    example: faker.internet.email(),
    required: true,
  })
  @IsEmail()
  @Transform(({ value }) => value?.toLowerCase().trim())
  email!: string;

  @ApiProperty({
    example: faker.person.firstName(),
    required: false,
    nullable: true,
  })
  @IsString()
  @IsOptional()
  @MinLength(2)
  @MaxLength(50)
  @Transform(({ value }) => value?.trim())
  firstName?: string | null;

  @ApiProperty({
    example: faker.person.lastName(),
    required: false,
    nullable: true,
  })
  @IsString()
  @IsOptional()
  @MinLength(2)
  @MaxLength(50)
  @Transform(({ value }) => value?.trim())
  lastName?: string | null;

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
    enum: Role,
    required: false,
    example: Role.USER,
    description: 'ADMIN não é permitido via esta rota.',
  })
  @IsEnum(Role)
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toUpperCase().trim() : value
  )
  role?: Role;
}

