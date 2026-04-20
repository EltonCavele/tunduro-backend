import { Controller, Delete, Get, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';

import { DocGenericResponse } from 'src/common/doc/decorators/doc.generic.decorator';
import { DocResponse } from 'src/common/doc/decorators/doc.response.decorator';
import { AllowedRoles } from 'src/common/request/decorators/request.role.decorator';
import { AuthUser } from 'src/common/request/decorators/request.user.decorator';
import { IAuthUser } from 'src/common/request/interfaces/request.interface';
import { ApiGenericResponseDto } from 'src/common/response/dtos/response.generic.dto';

import { UserService } from '../services/user.service';
import { UserGetProfileResponseDto } from '../dtos/response/user.response';

@ApiTags('admin.user')
@Controller({
  path: '/admin/user',
  version: '1',
})
export class UserAdminController {
  constructor(private readonly userService: UserService) {}

  @Get(':id')
  @AllowedRoles([Role.ADMIN])
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'Get user details' })
  @DocResponse({
    serialization: UserGetProfileResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'user.success.found',
  })
  public async getUser(
    @Param('id') userId: string
  ): Promise<UserGetProfileResponseDto> {
    return this.userService.getProfile(userId);
  }

  @Post(':id/suspend')
  @AllowedRoles([Role.ADMIN])
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'Suspend user' })
  @DocGenericResponse({
    httpStatus: HttpStatus.OK,
    messageKey: 'user.success.suspended',
  })
  public async suspendUser(
    @AuthUser() admin: IAuthUser,
    @Param('id') userId: string
  ): Promise<ApiGenericResponseDto> {
    return this.userService.suspendUser(userId, admin.userId);
  }

  @Post(':id/unsuspend')
  @AllowedRoles([Role.ADMIN])
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'Unsuspend user' })
  @DocGenericResponse({
    httpStatus: HttpStatus.OK,
    messageKey: 'user.success.unsuspended',
  })
  public async unsuspendUser(
    @AuthUser() admin: IAuthUser,
    @Param('id') userId: string
  ): Promise<ApiGenericResponseDto> {
    return this.userService.unsuspendUser(userId, admin.userId);
  }

  @Delete(':id')
  @AllowedRoles([Role.ADMIN])
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'Delete user' })
  @DocGenericResponse({
    httpStatus: HttpStatus.OK,
    messageKey: 'user.success.deleted',
  })
  public async deleteUser(
    @Param('id') userId: string
  ): Promise<ApiGenericResponseDto> {
    return this.userService.deleteUser(userId);
  }
}
