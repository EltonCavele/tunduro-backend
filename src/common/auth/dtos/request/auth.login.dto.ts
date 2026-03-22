import { faker } from '@faker-js/faker';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export const AUTH_PASSWORD_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

export class UserLoginDto {
  @ApiProperty({
    example: faker.internet.email(),
    required: false,
    description: 'Email or phone number',
  })
  @IsString()
  @IsOptional()
  @Transform(({ value }) => value?.trim())
  public identifier?: string;

  @ApiProperty({
    example: faker.internet.email(),
    required: false,
  })
  @IsEmail()
  @IsOptional()
  @Transform(({ value }) => value?.toLowerCase().trim())
  public email?: string;

  @ApiProperty({
    example: '+258841234567',
    required: false,
  })
  @IsString()
  @IsOptional()
  @Transform(({ value }) => value?.trim())
  public phone?: string;

  @ApiProperty({
    example: `${faker.string.alphanumeric(5).toLowerCase()}${faker.string
      .alphanumeric(5)
      .toUpperCase()}@@!${faker.number.int(1000)}`,
    required: true,
  })
  @IsString()
  @IsNotEmpty()
  public password: string;
}
