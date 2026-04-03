import { ApiGenericResponseDto } from 'src/common/response/dtos/response.generic.dto';
import { ApiPaginatedDataDto } from 'src/common/response/dtos/response.paginated.dto';

import { UserExpoPushTokenUpdateDto } from '../dtos/request/user.expo-push-token.update.request';
import { UserNotificationPreferencesUpdateDto } from '../dtos/request/user.notification-preferences.update.request';
import { UserUpdateDto } from '../dtos/request/user.update.request';
import {
  UserExpoPushTokenResponseDto,
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
  updateExpoPushToken(
    userId: string,
    data: UserExpoPushTokenUpdateDto
  ): Promise<UserExpoPushTokenResponseDto>;
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
