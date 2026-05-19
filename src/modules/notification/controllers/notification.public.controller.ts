import {
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { DocGenericResponse } from 'src/common/doc/decorators/doc.generic.decorator';
import { DocPaginatedResponse } from 'src/common/doc/decorators/doc.paginated.decorator';
import { DocResponse } from 'src/common/doc/decorators/doc.response.decorator';
import { AuthUser } from 'src/common/request/decorators/request.user.decorator';
import { IAuthUser } from 'src/common/request/interfaces/request.interface';
import { ApiGenericResponseDto } from 'src/common/response/dtos/response.generic.dto';
import { ApiPaginatedDataDto } from 'src/common/response/dtos/response.paginated.dto';

import { NotificationListQueryDto } from '../dtos/request/notification.list.request';
import { NotificationResponseDto } from '../dtos/response/notification.response';
import { NotificationService } from '../services/notification.service';

@ApiTags('public.notifications')
@Controller({
  path: '/notifications',
  version: '1',
})
export class NotificationPublicController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'Listar notificações do usuário autenticado' })
  @DocPaginatedResponse({
    serialization: NotificationResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'notification.success.list',
  })
  async listMyNotifications(
    @AuthUser() user: IAuthUser,
    @Query() query: NotificationListQueryDto
  ): Promise<ApiPaginatedDataDto<NotificationResponseDto>> {
    return this.notificationService.listUserNotifications(user.userId, query);
  }

  @Post(':id/read')
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'Marcar notificação como lida' })
  @DocResponse({
    serialization: NotificationResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'notification.success.markedAsRead',
  })
  async markAsRead(
    @AuthUser() user: IAuthUser,
    @Param('id') notificationId: string
  ): Promise<NotificationResponseDto> {
    return this.notificationService.markAsRead(user.userId, notificationId);
  }

  @Delete(':id')
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'Apagar uma notificação do usuário autenticado' })
  @DocGenericResponse({
    httpStatus: HttpStatus.OK,
    messageKey: 'notification.success.deleted',
  })
  async deleteNotification(
    @AuthUser() user: IAuthUser,
    @Param('id') notificationId: string
  ): Promise<ApiGenericResponseDto> {
    return this.notificationService.deleteNotification(user.userId, notificationId);
  }
}
