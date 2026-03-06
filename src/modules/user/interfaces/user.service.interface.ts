import { ApiGenericResponseDto } from 'src/common/response/dtos/response.generic.dto';
import { ApiPaginatedDataDto } from 'src/common/response/dtos/response.paginated.dto';

import { UserNotificationPreferencesUpdateDto } from '../dtos/request/user.notification-preferences.update.request';
import { UserUpdateDto } from '../dtos/request/user.update.request';
import {
  UserGetProfileResponseDto,
  UserNotificationPreferencesResponseDto,
  UserUpdateProfileResponseDto,
} from '../dtos/response/user.response';

export interface IUserService {
  updateUser(
    userId: string,
    data: UserUpdateDto
  ): Promise<UserUpdateProfileResponseDto>;
  getNotificationPreferences(
    userId: string
  ): Promise<UserNotificationPreferencesResponseDto>;
  updateNotificationPreferences(
    userId: string,
    data: UserNotificationPreferencesUpdateDto
  ): Promise<UserNotificationPreferencesResponseDto>;
  deleteUser(userId: string): Promise<ApiGenericResponseDto>;
  getProfile(userId: string): Promise<UserGetProfileResponseDto>;
  getListOfUsers(
    userId: string,
    q?: string,
    page?: number,
    pageSize?: number,
    offset?: number,
    limit?: number,
    sortBy?: string,
    sortOrder?: 'asc' | 'desc',
    gender?: string
  ): Promise<ApiPaginatedDataDto<UserGetProfileResponseDto>>;
}
