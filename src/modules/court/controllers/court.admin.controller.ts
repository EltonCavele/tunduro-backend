import {
  Body,
  Controller,
  Delete,
  HttpStatus,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';

import { DocGenericResponse } from 'src/common/doc/decorators/doc.generic.decorator';
import { DocResponse } from 'src/common/doc/decorators/doc.response.decorator';
import { AllowedRoles } from 'src/common/request/decorators/request.role.decorator';
import { AuthUser } from 'src/common/request/decorators/request.user.decorator';
import { IAuthUser } from 'src/common/request/interfaces/request.interface';
import { ApiGenericResponseDto } from 'src/common/response/dtos/response.generic.dto';

import {
  CourtCreateRequestDto,
  CourtGalleryPresignRequestDto,
  CourtGalleryUpsertRequestDto,
  CourtUpdateRequestDto,
} from '../dtos/request/court.create.request';
import {
  CourtGalleryPresignResponseDto,
  CourtResponseDto,
} from '../dtos/response/court.response';
import { CourtService } from '../services/court.service';

@ApiTags('admin.courts')
@Controller({
  path: '/admin/courts',
  version: '1',
})
export class CourtAdminController {
  constructor(private readonly courtService: CourtService) {}

  @Post()
  @AllowedRoles([Role.ADMIN])
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'Create court' })
  @DocResponse({
    serialization: CourtResponseDto,
    httpStatus: HttpStatus.CREATED,
    messageKey: 'court.success.created',
  })
  async createCourt(
    @Body() payload: CourtCreateRequestDto
  ): Promise<CourtResponseDto> {
    return this.courtService.createCourt(payload);
  }

  @Put(':id')
  @AllowedRoles([Role.ADMIN])
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'Update court' })
  @DocResponse({
    serialization: CourtResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'court.success.updated',
  })
  async updateCourt(
    @Param('id') courtId: string,
    @Body() payload: CourtUpdateRequestDto
  ): Promise<CourtResponseDto> {
    return this.courtService.updateCourt(courtId, payload);
  }

  @Delete(':id')
  @AllowedRoles([Role.ADMIN])
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'Soft delete court and cancel future bookings' })
  @DocGenericResponse({
    httpStatus: HttpStatus.OK,
    messageKey: 'court.success.deleted',
  })
  async deleteCourt(
    @AuthUser() user: IAuthUser,
    @Param('id') courtId: string
  ): Promise<ApiGenericResponseDto> {
    return this.courtService.deleteCourt(courtId, user.userId);
  }

  @Post(':id/restore')
  @AllowedRoles([Role.ADMIN])
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'Restore soft-deleted court' })
  @DocGenericResponse({
    httpStatus: HttpStatus.OK,
    messageKey: 'court.success.restored',
  })
  async restoreCourt(
    @Param('id') courtId: string
  ): Promise<ApiGenericResponseDto> {
    return this.courtService.restoreCourt(courtId);
  }

  @Post(':id/gallery/presign')
  @AllowedRoles([Role.ADMIN])
  @ApiBearerAuth('accessToken')
  @ApiOperation({
    summary: 'Create mock S3 presigned URL for court gallery upload',
  })
  @DocResponse({
    serialization: CourtGalleryPresignResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'court.success.galleryPresign',
  })
  async createGalleryPresign(
    @Param('id') courtId: string,
    @Body() payload: CourtGalleryPresignRequestDto
  ): Promise<CourtGalleryPresignResponseDto> {
    return this.courtService.createGalleryPresign(courtId, payload);
  }

  @Put(':id/gallery')
  @AllowedRoles([Role.ADMIN])
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'Replace court gallery URLs and order' })
  @DocResponse({
    serialization: CourtResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'court.success.galleryUpdated',
  })
  async replaceGallery(
    @Param('id') courtId: string,
    @Body() payload: CourtGalleryUpsertRequestDto
  ): Promise<CourtResponseDto> {
    return this.courtService.replaceGallery(courtId, payload);
  }
}
