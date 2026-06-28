import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class WalletTopUpRequestDto {
  @ApiProperty({ example: 1500, minimum: 0.01 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiPropertyOptional({ example: 'Carregamento no balcão' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}
