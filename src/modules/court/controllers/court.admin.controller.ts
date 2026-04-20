import {
  Body,
  Controller,
  Delete,
  HttpStatus,
  Param,
  Post,
  Put,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';

import { DocGenericResponse } from 'src/common/doc/decorators/doc.generic.decorator';
import { DocResponse } from 'src/common/doc/decorators/doc.response.decorator';
import { AllowedRoles } from 'src/common/request/decorators/request.role.decorator';
import { AuthUser } from 'src/common/request/decorators/request.user.decorator';
import { IAuthUser } from 'src/common/request/interfaces/request.interface';
import { ApiGenericResponseDto } from 'src/common/response/dtos/response.generic.dto';

import {
  CourtCreateRequestDto,
  CourtUpdateRequestDto,
} from '../dtos/request/court.create.request';
import { CourtResponseDto } from '../dtos/response/court.response';
import { CourtService } from '../services/court.service';

@ApiTags('admin.courts')
@Controller({
  path: '/admin/courts',
  version: '1',
})
export class CourtAdminController {
  constructor(private readonly courtService: CourtService) {}

  private getCourtUploadFiles(uploadedFiles?: {
    images?: Express.Multer.File[];
    files?: Express.Multer.File[];
  }): Express.Multer.File[] | undefined {
    return uploadedFiles?.images?.length
      ? uploadedFiles.images
      : uploadedFiles?.files;
  }

  @Post()
  @AllowedRoles([Role.ADMIN])
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'Create court' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'images', maxCount: 10 },
      { name: 'files', maxCount: 10 },
    ])
  )
  @DocResponse({
    serialization: CourtResponseDto,
    httpStatus: HttpStatus.CREATED,
    messageKey: 'court.success.created',
  })
  async createCourt(
    @Body() payload: CourtCreateRequestDto,
    @UploadedFiles()
    uploadedFiles?: { images?: Express.Multer.File[]; files?: Express.Multer.File[] }
  ): Promise<CourtResponseDto> {
    return this.courtService.createCourt(
      payload,
      this.getCourtUploadFiles(uploadedFiles)
    );
  }

  @Put(':id')
  @AllowedRoles([Role.ADMIN])
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'Update court' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'images', maxCount: 10 },
      { name: 'files', maxCount: 10 },
    ])
  )
  @DocResponse({
    serialization: CourtResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'court.success.updated',
  })
  async updateCourt(
    @Param('id') courtId: string,
    @Body() payload: CourtUpdateRequestDto,
    @UploadedFiles()
    uploadedFiles?: { images?: Express.Multer.File[]; files?: Express.Multer.File[] }
  ): Promise<CourtResponseDto> {
    return this.courtService.updateCourt(
      courtId,
      payload,
      this.getCourtUploadFiles(uploadedFiles)
    );
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
}
