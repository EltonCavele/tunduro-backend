import { UserNotificationPreferencesResponseDto } from '../dtos/response/user.response';

export function getPreferencesFromUser(
  user: Record<string, any>
): UserNotificationPreferencesResponseDto {
  return {
    notifyPush: typeof user.notifyPush === 'boolean' ? user.notifyPush : true,
    notifySms: typeof user.notifySms === 'boolean' ? user.notifySms : true,
    notifyEmail:
      typeof user.notifyEmail === 'boolean' ? user.notifyEmail : true,
  };
}

export function normalizeUser<T extends Record<string, any>>(user: T): T {
  const { expoPushToken: _expoPushToken, ...safeUser } = user;

  return {
    ...safeUser,
    avatarUrl: safeUser.avatarUrl ?? null,
    level: safeUser.level ?? null,
    favoriteCourt: safeUser.favoriteCourt ?? null,
    preferredTimeSlots: Array.isArray(safeUser.preferredTimeSlots)
      ? safeUser.preferredTimeSlots
      : [],
    ...getPreferencesFromUser(user),
  } as unknown as T;
}
