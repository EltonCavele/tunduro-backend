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

export class WalletSelfTopUpRequestDto {
  @ApiProperty({ example: 1500, minimum: 0.01 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiPropertyOptional({
    example: '258841234567',
    description: 'Opcional; PaySuite recolhe o numero no checkout',
  })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({
    example: 'exp://192.168.1.10:8081/--/payments/wallet-return',
    description: 'Deep link gerado pelo app para voltar apos o PaySuite',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  returnUrl?: string;
}
