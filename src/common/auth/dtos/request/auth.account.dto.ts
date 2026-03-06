import { faker } from '@faker-js/faker';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsNotEmpty, IsString, Matches } from 'class-validator';

import { AUTH_PASSWORD_REGEX } from './auth.login.dto';

export type OtpChannel = 'EMAIL' | 'SMS';

export class IdentifierPayloadDto {
  @ApiProperty({
    example: faker.internet.email(),
    description: 'Email or phone number',
  })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => value?.trim())
  identifier: string;
}

export class RequestVerificationOtpDto extends IdentifierPayloadDto {
  @ApiProperty({
    required: false,
    enum: ['EMAIL', 'SMS'],
    default: 'EMAIL',
  })
  @IsIn(['EMAIL', 'SMS'])
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toUpperCase().trim() : 'EMAIL'
  )
  channel: OtpChannel = 'EMAIL';
}

export class VerifyAccountOtpDto extends IdentifierPayloadDto {
  @ApiProperty({
    example: `${faker.number.int({ min: 100000, max: 999999 })}`,
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4,8}$/)
  @Transform(({ value }) => value?.trim())
  otp: string;
}

export class ForgotPasswordDto extends IdentifierPayloadDto {}

export class ResetPasswordDto extends VerifyAccountOtpDto {
  @ApiProperty({
    example: `${faker.string.alphanumeric(5).toLowerCase()}${faker.string
      .alphanumeric(5)
      .toUpperCase()}@@!${faker.number.int(1000)}`,
  })
  @IsString()
  @IsNotEmpty()
  @Matches(AUTH_PASSWORD_REGEX)
  newPassword: string;
}
