import { Controller, Get, HttpStatus, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';

import { DocPaginatedResponse } from 'src/common/doc/decorators/doc.paginated.decorator';
import { DocResponse } from 'src/common/doc/decorators/doc.response.decorator';
import { AuthUser } from 'src/common/request/decorators/request.user.decorator';
import { IAuthUser } from 'src/common/request/interfaces/request.interface';
import { ApiPaginatedDataDto } from 'src/common/response/dtos/response.paginated.dto';

import {
  CourtBookingsQueryRequestDto,
  CourtListQueryRequestDto,
} from '../dtos/request/court.create.request';
import {
  CourtBookingPublicResponseDto,
  CourtResponseDto,
} from '../dtos/response/court.response';
import { CourtService } from '../services/court.service';

@ApiTags('public.courts')
@Controller({
  path: '/courts',
  version: '1',
})
export class CourtPublicController {
  constructor(private readonly courtService: CourtService) {}

  @Get()
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'List courts with optional availability filter' })
  @DocPaginatedResponse({
    serialization: CourtResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'court.success.list',
  })
  async listCourts(
    @Query() query: CourtListQueryRequestDto
  ): Promise<ApiPaginatedDataDto<CourtResponseDto>> {
    return this.courtService.listCourts(query);
  }

  @Get(':id')
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'Get court details' })
  @DocResponse({
    serialization: CourtResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'court.success.details',
  })
  async getCourt(@Param('id') courtId: string): Promise<CourtResponseDto> {
    return this.courtService.getCourt(courtId);
  }

  @Get(':id/bookings')
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'Get court bookings (public-safe payload)' })
  @DocPaginatedResponse({
    serialization: CourtBookingPublicResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'court.success.bookings',
  })
  async getCourtBookings(
    @AuthUser() user: IAuthUser,
    @Param('id') courtId: string,
    @Query() query: CourtBookingsQueryRequestDto
  ): Promise<ApiPaginatedDataDto<CourtBookingPublicResponseDto>> {
    const isAdmin = user.role === Role.ADMIN;

    return this.courtService.getCourtBookings(
      courtId,
      isAdmin,
      query
    ) as Promise<ApiPaginatedDataDto<CourtBookingPublicResponseDto>>;
  }
}
