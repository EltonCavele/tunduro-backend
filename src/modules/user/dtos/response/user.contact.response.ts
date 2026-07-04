import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { IsEmail, IsOptional, IsString, ValidateNested } from 'class-validator';

import { UserGetProfileResponseDto } from './user.response';

export class UserContactResponseDto {
  @ApiProperty({ example: 'contact-id' })
  @Expose()
  @IsString()
  id: string;

  @ApiPropertyOptional({ example: 'Mateus Cossa', nullable: true })
  @Expose()
  @IsOptional()
  @IsString()
  displayName: string | null;

  @ApiProperty({ example: 'mateus@example.com' })
  @Expose()
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ example: '+258841234567', nullable: true })
  @Expose()
  @IsOptional()
  @IsString()
  phone: string | null;

  @ApiPropertyOptional({ example: 'user-id', nullable: true })
  @Expose()
  @IsOptional()
  @IsString()
  linkedUserId: string | null;

  @ApiPropertyOptional({
    type: () => UserGetProfileResponseDto,
    nullable: true,
  })
  @Expose()
  @IsOptional()
  @ValidateNested()
  @Type(() => UserGetProfileResponseDto)
  linkedUser: UserGetProfileResponseDto | null;
}
