import { faker } from '@faker-js/faker';
import { ApiProperty } from '@nestjs/swagger';
import { $Enums } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';

import { AUTH_PASSWORD_REGEX } from './auth.login.dto';

export class UserCreateDto {
  @ApiProperty({
    example: faker.internet.email(),
    required: true,
  })
  @IsEmail()
  @IsNotEmpty()
  @Transform(({ value }) => value?.toLowerCase().trim())
  public email: string;

  @ApiProperty({
    example: `${faker.string.alphanumeric(5).toLowerCase()}${faker.string
      .alphanumeric(5)
      .toUpperCase()}@@!${faker.number.int(1000)}`,
    required: true,
  })
  @IsString()
  @IsNotEmpty()
  @Matches(AUTH_PASSWORD_REGEX)
  public password: string;

  @ApiProperty({
    example: faker.person.firstName(),
    required: false,
  })
  @IsString()
  @IsOptional()
  @Length(1, 50)
  public firstName?: string;

  @ApiProperty({
    example: faker.person.lastName(),
    required: false,
  })
  @IsString()
  @IsOptional()
  @Length(1, 50)
  public lastName?: string;

  @ApiProperty({
    example: '+258841234567',
    required: false,
  })
  @IsString()
  @IsOptional()
  @Transform(({ value }) => value?.trim())
  public phone?: string;

  @ApiProperty({
    required: false,
    enum: $Enums.Gender,
    example: $Enums.Gender.OTHER,
  })
  @IsEnum($Enums.Gender)
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toUpperCase().trim() : value
  )
  public gender?: $Enums.Gender;
}
