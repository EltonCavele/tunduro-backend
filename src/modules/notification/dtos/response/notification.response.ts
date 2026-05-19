import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Transform } from 'class-transformer';

const toDate = ({ value }: { value: unknown }): unknown => {
  if (value === undefined || value === null) {
    return value;
  }
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date;
  }
  return value;
};

export class NotificationResponseDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  userId: string;

  @ApiProperty()
  @Expose()
  title: string;

  @ApiProperty()
  @Expose()
  body: string;

  @ApiPropertyOptional({
    type: Object,
    nullable: true,
    additionalProperties: true,
  })
  @Expose()
  data: Record<string, unknown> | null;

  @ApiPropertyOptional({ nullable: true })
  @Expose()
  @Transform(toDate)
  readAt: Date | null;

  @ApiProperty()
  @Expose()
  @Transform(toDate)
  createdAt: Date;

  @ApiProperty()
  @Expose()
  @Transform(toDate)
  updatedAt: Date;
}
