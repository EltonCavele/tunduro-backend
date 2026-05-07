import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';

import { DocGenericResponse } from 'src/common/doc/decorators/doc.generic.decorator';
import { DocPaginatedResponse } from 'src/common/doc/decorators/doc.paginated.decorator';
import { DocResponse } from 'src/common/doc/decorators/doc.response.decorator';
import { AllowedRoles } from 'src/common/request/decorators/request.role.decorator';
import { AuthUser } from 'src/common/request/decorators/request.user.decorator';
import { IAuthUser } from 'src/common/request/interfaces/request.interface';
import { ApiGenericResponseDto } from 'src/common/response/dtos/response.generic.dto';
import { ApiPaginatedDataDto } from 'src/common/response/dtos/response.paginated.dto';

import { UserService } from '../services/user.service';
import { UserGetProfileResponseDto } from '../dtos/response/user.response';
import { UserAdminCreateDto } from '../dtos/request/user.admin-create.request';

@ApiTags('admin.user')
@Controller({
  path: '/admin/user',
  version: '1',
})
export class UserAdminController {
  constructor(private readonly userService: UserService) {}

  @Post()
  @AllowedRoles([Role.ADMIN, Role.EMPLOYEE])
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'Create a new user and email credentials' })
  @DocResponse({
    serialization: UserGetProfileResponseDto,
    httpStatus: HttpStatus.CREATED,
    messageKey: 'user.success.created',
  })
  public async createUser(
    @AuthUser() admin: IAuthUser,
    @Body() payload: UserAdminCreateDto
  ): Promise<UserGetProfileResponseDto> {
    return this.userService.createUserByAdmin(admin.userId, payload);
  }

  @Get('all')
  @AllowedRoles([Role.ADMIN, Role.EMPLOYEE])
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'Get admin/employee users list' })
  @DocPaginatedResponse({
    serialization: UserGetProfileResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'user.success.profile',
  })
  public async getAdminAndEmployeeUsers(
    @AuthUser() admin: IAuthUser,
    @Query('q') q: string,
    @Query('page') page: number,
    @Query('pageSize') pageSize: number,
    @Query('offset') offset: number,
    @Query('limit') limit: number,
    @Query('sortBy') sortBy: string,
    @Query('sortOrder') sortOrder: 'asc' | 'desc',
    @Query('gender') gender: string,
    @Query('role') role: string
  ): Promise<ApiPaginatedDataDto<UserGetProfileResponseDto>> {
    return this.userService.getListOfUsers(
      admin.userId,
      q,
      page,
      pageSize,
      offset,
      limit,
      sortBy,
      sortOrder,
      gender,
      role,
      [Role.ADMIN, Role.EMPLOYEE]
    );
  }

  @Get(':id')
  @AllowedRoles([Role.ADMIN, Role.EMPLOYEE])
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
  @AllowedRoles([Role.ADMIN, Role.EMPLOYEE])
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
  @AllowedRoles([Role.ADMIN, Role.EMPLOYEE])
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
