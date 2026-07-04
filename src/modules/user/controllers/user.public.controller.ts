import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';

import { DocGenericResponse } from 'src/common/doc/decorators/doc.generic.decorator';
import { DocPaginatedResponse } from 'src/common/doc/decorators/doc.paginated.decorator';
import { DocResponse } from 'src/common/doc/decorators/doc.response.decorator';
import { AuthUser } from 'src/common/request/decorators/request.user.decorator';
import { IAuthUser } from 'src/common/request/interfaces/request.interface';
import { ApiPaginatedDataDto } from 'src/common/response/dtos/response.paginated.dto';
import { ApiGenericResponseDto } from 'src/common/response/dtos/response.generic.dto';

import { UserChangePasswordDto } from '../dtos/request/user.change-password.request';
import {
  UserContactCreateDto,
  UserContactInviteDto,
  UserContactListQueryDto,
} from '../dtos/request/user.contact.request';
import { UserDeleteAccountDto } from '../dtos/request/user.delete-account.request';
import { UserNotificationPreferencesUpdateDto } from '../dtos/request/user.notification-preferences.update.request';
import { UserUpdateDto } from '../dtos/request/user.update.request';
import { UserContactResponseDto } from '../dtos/response/user.contact.response';
import {
  UserExpoPushTokenResponseDto,
  UserGetProfileResponseDto,
  UserNotificationPreferencesResponseDto,
  UserUpdateProfileResponseDto,
} from '../dtos/response/user.response';
import { UserExpoPushTokenUpdateDto } from '../dtos/request/user.expo-push-token.update.request';
import { UserContactService } from '../services/user-contact.service';
import { UserService } from '../services/user.service';

@ApiTags('public.user')
@Controller({
  path: '/user',
  version: '1',
})
export class UserPublicController {
  constructor(
    private readonly userService: UserService,
    private readonly userContactService: UserContactService
  ) {}

  @Get('contacts')
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'Get logged-in user contacts' })
  @DocPaginatedResponse({
    serialization: UserContactResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'user.success.contacts',
  })
  public async listContacts(
    @AuthUser() user: IAuthUser,
    @Query() query: UserContactListQueryDto
  ): Promise<ApiPaginatedDataDto<UserContactResponseDto>> {
    return this.userContactService.listContacts(user.userId, query);
  }

  @Post('contacts')
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'Create logged-in user contact' })
  @DocResponse({
    serialization: UserContactResponseDto,
    httpStatus: HttpStatus.CREATED,
    messageKey: 'user.success.contactCreated',
  })
  public async createContact(
    @AuthUser() user: IAuthUser,
    @Body() payload: UserContactCreateDto
  ): Promise<UserContactResponseDto> {
    return this.userContactService.createContact(user.userId, payload);
  }

  @Post('contacts/invite')
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'Invite a friend by email' })
  @DocResponse({
    serialization: UserContactResponseDto,
    httpStatus: HttpStatus.CREATED,
    messageKey: 'user.success.contactInvited',
  })
  public async inviteContact(
    @AuthUser() user: IAuthUser,
    @Body() payload: UserContactInviteDto
  ): Promise<UserContactResponseDto> {
    return this.userContactService.inviteContact(user.userId, payload);
  }

  @Delete('contacts/:id')
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'Delete logged-in user contact' })
  @DocGenericResponse({
    httpStatus: HttpStatus.OK,
    messageKey: 'user.success.contactDeleted',
  })
  public async deleteContact(
    @AuthUser() user: IAuthUser,
    @Param('id') contactId: string
  ): Promise<ApiGenericResponseDto> {
    return this.userContactService.deleteContact(user.userId, contactId);
  }

  @Get('all')
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'Get users list' })
  @DocPaginatedResponse({
    serialization: UserGetProfileResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'user.success.profile',
  })
  public async filListOfUsers(
    @AuthUser() user: IAuthUser,
    @Query('q') q: string,
    @Query('page') page: number,
    @Query('pageSize') pageSize: number,
    @Query('offset') offset: number,
    @Query('limit') limit: number,
    @Query('sortBy') sortBy: string,
    @Query('sortOrder') sortOrder: 'asc' | 'desc',
    @Query('gender') gender: string
  ): Promise<ApiPaginatedDataDto<UserGetProfileResponseDto>> {
    return this.userService.getListOfUsers(
      user.userId,
      q,
      page,
      pageSize,
      offset,
      limit,
      sortBy,
      sortOrder,
      gender,
      undefined,
      [Role.USER, Role.MEMBER]
    );
  }

  @Get('profile')
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'Get user profile' })
  @DocResponse({
    serialization: UserGetProfileResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'user.success.profile',
  })
  public async getProfile(
    @AuthUser() user: IAuthUser
  ): Promise<UserGetProfileResponseDto> {
    return this.userService.getProfile(user.userId);
  }

  @Get('notification-preferences')
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'Get notification preferences' })
  @DocResponse({
    serialization: UserNotificationPreferencesResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'user.success.notificationPreferences',
  })
  public async getNotificationPreferences(
    @AuthUser() user: IAuthUser
  ): Promise<UserNotificationPreferencesResponseDto> {
    return this.userService.getNotificationPreferences(user.userId);
  }

  @Put()
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'Update user' })
  @DocResponse({
    serialization: UserUpdateProfileResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'user.success.updated',
  })
  public async update(
    @AuthUser() user: IAuthUser,
    @Body() payload: UserUpdateDto
  ): Promise<UserUpdateProfileResponseDto> {
    return this.userService.updateUser(user.userId, payload);
  }

  @Put('password')
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'Change the logged-in user password' })
  @DocResponse({
    serialization: ApiGenericResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'user.success.passwordChanged',
  })
  public async changePassword(
    @AuthUser() user: IAuthUser,
    @Body() payload: UserChangePasswordDto
  ): Promise<ApiGenericResponseDto> {
    return this.userService.changePassword(user.userId, payload);
  }

  @Delete('me')
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'Delete the logged-in user account' })
  @DocGenericResponse({
    httpStatus: HttpStatus.OK,
    messageKey: 'user.success.deleted',
  })
  public async deleteMyAccount(
    @AuthUser() user: IAuthUser,
    @Body() payload: UserDeleteAccountDto
  ): Promise<ApiGenericResponseDto> {
    return this.userService.deleteOwnAccount(user.userId, payload);
  }

  @Put('notification-preferences')
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'Update notification preferences' })
  @DocResponse({
    serialization: UserNotificationPreferencesResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'user.success.notificationPreferencesUpdated',
  })
  public async updateNotificationPreferences(
    @AuthUser() user: IAuthUser,
    @Body() payload: UserNotificationPreferencesUpdateDto
  ): Promise<UserNotificationPreferencesResponseDto> {
    return this.userService.updateNotificationPreferences(user.userId, payload);
  }

  @Put('expo-push-token')
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'Register Expo push token for the logged-in user' })
  @DocResponse({
    serialization: UserExpoPushTokenResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'user.success.expoPushTokenUpdated',
  })
  public async updateExpoPushToken(
    @AuthUser() user: IAuthUser,
    @Body() payload: UserExpoPushTokenUpdateDto
  ): Promise<UserExpoPushTokenResponseDto> {
    return this.userService.updateExpoPushToken(user.userId, payload);
  }

  @Post('notification-preferences/test-push')
  @ApiBearerAuth('accessToken')
  @ApiOperation({
    summary: 'Smoke-test do push notification (ignora flag notifyPush)',
    description:
      'Envia uma notificação directa ao expoPushToken do user autenticado. Devolve diagnóstico (config Expo, presença de token, resultado do envio).',
  })
  public async testPush(@AuthUser() user: IAuthUser): Promise<unknown> {
    return this.userService.sendTestPush(user.userId);
  }
}
