import { faker } from '@faker-js/faker';
import { ApiHideProperty, ApiProperty } from '@nestjs/swagger';
import { $Enums } from '@prisma/client';
import { Exclude, Expose } from 'class-transformer';
import {
  IsArray,
  IsDate,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  IsBoolean,
} from 'class-validator';

export class UserResponseDto {
  @ApiProperty({
    example: faker.string.uuid(),
  })
  @Expose()
  @IsUUID()
  id: string;

  @ApiProperty({
    example: faker.internet.email(),
  })
  @Expose()
  @IsEmail()
  email: string;

  @ApiProperty({
    example: faker.person.firstName(),
    required: false,
    nullable: true,
  })
  @Expose()
  @IsString()
  @IsOptional()
  firstName: string | null;

  @ApiProperty({
    example: faker.person.lastName(),
    required: false,
    nullable: true,
  })
  @Expose()
  @IsString()
  @IsOptional()
  lastName: string | null;

  @ApiProperty({
    example: faker.phone.number(),
    required: false,
    nullable: true,
  })
  @Expose()
  @IsString()
  @IsOptional()
  phone: string | null;

  @ApiProperty({
    enum: $Enums.Gender,
    example: faker.helpers.arrayElement(Object.values($Enums.Gender)),
  })
  @Expose()
  @IsEnum($Enums.Gender)
  gender: $Enums.Gender;

  @ApiProperty({
    example: faker.image.avatar(),
    required: false,
    nullable: true,
  })
  @Expose()
  @IsUrl()
  @IsOptional()
  avatarUrl: string | null;

  @ApiProperty({
    example: 'BEGINNER',
    required: false,
    nullable: true,
  })
  @Expose()
  @IsString()
  @IsOptional()
  level: string | null;

  @ApiProperty({
    example: 'Court A',
    required: false,
    nullable: true,
  })
  @Expose()
  @IsString()
  @IsOptional()
  favoriteCourt: string | null;

  @ApiProperty({
    example: ['06:00-08:00', '18:00-20:00'],
    type: [String],
  })
  @Expose()
  @IsArray()
  @IsString({ each: true })
  preferredTimeSlots: string[];

  @ApiProperty({
    example: true,
  })
  @Expose()
  @IsBoolean()
  notifyPush: boolean;

  @ApiProperty({
    example: true,
  })
  @Expose()
  @IsBoolean()
  notifySms: boolean;

  @ApiProperty({
    example: true,
  })
  @Expose()
  @IsBoolean()
  notifyEmail: boolean;

  @ApiProperty({
    enum: $Enums.Role,
    example: faker.helpers.arrayElement(Object.values($Enums.Role)),
  })
  @Expose()
  @IsEnum($Enums.Role)
  role: $Enums.Role;

  @ApiProperty({
    example: faker.datatype.boolean(),
  })
  @Expose()
  @IsBoolean()
  isVerified: boolean;

  @ApiProperty({
    example: faker.date.past().toISOString(),
  })
  @Expose()
  @IsDate()
  createdAt: Date;

  @ApiProperty({
    example: faker.date.recent().toISOString(),
  })
  @Expose()
  @IsDate()
  updatedAt: Date;

  @ApiProperty({
    example: faker.date.future().toISOString(),
    required: false,
    nullable: true,
  })
  @Expose()
  @IsDate()
  @IsOptional()
  deletedAt: Date | null;

  @ApiHideProperty()
  @Exclude()
  password: string;
}

export class UserGetProfileResponseDto extends UserResponseDto {}

export class UserUpdateProfileResponseDto extends UserResponseDto {}

export class UserNotificationPreferencesResponseDto {
  @ApiProperty({
    example: true,
  })
  @Expose()
  @IsBoolean()
  notifyPush: boolean;

  @ApiProperty({
    example: true,
  })
  @Expose()
  @IsBoolean()
  notifySms: boolean;

  @ApiProperty({
    example: true,
  })
  @Expose()
  @IsBoolean()
  notifyEmail: boolean;
}

export class UserExpoPushTokenResponseDto {
  @ApiProperty({
    example: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]',
    description: 'Registered Expo push token',
  })
  @Expose()
  @IsString()
  expoPushToken: string;
}
