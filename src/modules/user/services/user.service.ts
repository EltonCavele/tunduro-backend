import { HttpStatus, Injectable, HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { $Enums, Prisma, Role } from '@prisma/client';
import crypto from 'crypto';
import Handlebars from 'handlebars';

import { DatabaseService } from 'src/common/database/services/database.service';
import { ApiGenericResponseDto } from 'src/common/response/dtos/response.generic.dto';
import { ApiPaginatedDataDto } from 'src/common/response/dtos/response.paginated.dto';

import { HelperEncryptionService } from 'src/common/helper/services/helper.encryption.service';
import { HelperNotificationService } from 'src/common/helper/services/helper.notification.service';

import { UserAdminCreateDto } from '../dtos/request/user.admin-create.request';
import { UserExpoPushTokenUpdateDto } from '../dtos/request/user.expo-push-token.update.request';
import { UserNotificationPreferencesUpdateDto } from '../dtos/request/user.notification-preferences.update.request';
import { UserUpdateDto } from '../dtos/request/user.update.request';
import {
  UserExpoPushTokenResponseDto,
  UserGetProfileResponseDto,
  UserNotificationPreferencesResponseDto,
  UserUpdateProfileResponseDto,
} from '../dtos/response/user.response';
import { IUserService } from '../interfaces/user.service.interface';

const USER_CREDENTIALS_EMAIL_TEMPLATE = `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8" />
  <title>Credenciais de Acesso</title>
</head>
<body style="font-family: Arial, sans-serif; background:#f4f4f4; padding:20px;">

  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center">

        <table width="600" cellpadding="0" cellspacing="0" 
          style="background:#ffffff; border-radius:10px; padding:40px;">

          <tr>
            <td align="center">
              <h1 style="color:#1e3a8a;">
                Campos de Ténis Tunduro
              </h1>
            </td>
          </tr>

          <tr>
            <td>
              <p>Olá <strong>{{nome}}</strong>,</p>

              <p>
                A sua conta foi criada com sucesso na plataforma 
                <strong>Campos de Ténis Tunduro</strong>.
              </p>

              <p>Use as credenciais abaixo para acessar o sistema:</p>

              <div style="
                background:#f3f4f6;
                padding:20px;
                border-radius:8px;
                margin:20px 0;
              ">
                <p><strong>Email:</strong> {{email}}</p>
                <p><strong>Senha:</strong> {{senha}}</p>
              </div>

              <p>
                Recomendamos alterar a senha após o primeiro login.
              </p>

              <p>
                Clique no botão abaixo para acessar o sistema:
              </p>

              <p style="text-align:center; margin:30px 0;">
                <a href="{{frontend_url}}" 
                  style="
                    background:#2563eb;
                    color:white;
                    padding:12px 24px;
                    text-decoration:none;
                    border-radius:6px;
                    display:inline-block;
                  ">
                  Acessar Plataforma
                </a>
              </p>

              <p>
                Caso tenha alguma dificuldade, entre em contacto com o administrador.
              </p>

              <br />

              <p>
                Atenciosamente,<br />
                <strong>Equipa Campos de Ténis Tunduro</strong>
              </p>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>

</body>
</html>
`;

@Injectable()
export class UserService implements IUserService {
  private readonly credentialsTemplate = Handlebars.compile(
    USER_CREDENTIALS_EMAIL_TEMPLATE
  );

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly helperEncryptionService: HelperEncryptionService,
    private readonly helperNotificationService: HelperNotificationService,
    private readonly configService: ConfigService
  ) {}

  async createUserByAdmin(
    adminId: string,
    data: UserAdminCreateDto
  ): Promise<UserGetProfileResponseDto> {
    const email = data.email?.toLowerCase().trim();
    const phone = data.phone?.trim();
    const role = data.role ?? Role.USER;

    if (role === Role.ADMIN) {
      throw new HttpException('auth.error.forbidden', HttpStatus.FORBIDDEN);
    }

    const existingByEmail = await this.databaseService.user.findFirst({
      where: {
        email,
        deletedAt: null,
      },
    });
    if (existingByEmail) {
      throw new HttpException('user.error.userExists', HttpStatus.CONFLICT);
    }

    if (phone) {
      const existingByPhone = await this.databaseService.user.findFirst({
        where: {
          phone,
          deletedAt: null,
        },
      });
      if (existingByPhone) {
        throw new HttpException('user.error.userExists', HttpStatus.CONFLICT);
      }
    }

    const plainPassword = this.generatePassword();
    const hashed = await this.helperEncryptionService.createHash(plainPassword);

    const createdUser = await this.databaseService.user.create({
      data: {
        email,
        password: hashed,
        firstName: data.firstName?.trim() ?? null,
        lastName: data.lastName?.trim() ?? null,
        phone: phone ?? null,
        gender: data.gender ?? $Enums.Gender.OTHER,
        role,
        isVerified: true,
        tokenVersion: 0,
      } as any,
    });

    const frontendUrl =
      this.configService.get<string>('app.frontendUrl') ??
      process.env.APP_FRONTEND_URL ??
      '';

    const nome = `${createdUser.firstName ?? ''} ${
      createdUser.lastName ?? ''
    }`.trim();

    const html = this.credentialsTemplate({
      nome: nome || 'utilizador',
      email: createdUser.email,
      senha: plainPassword,
      frontend_url: frontendUrl,
    });

    const emailResult = await this.helperNotificationService.sendEmail({
      to: createdUser.email,
      subject: 'Credenciais de Acesso - Campos de Ténis Tunduro',
      html,
    });

    if (!emailResult.success) {
      await this.databaseService.user.delete({ where: { id: createdUser.id } });
      throw new HttpException(
        'auth.error.notificationDeliveryFailed',
        HttpStatus.SERVICE_UNAVAILABLE
      );
    }

    void adminId;
    return this.normalizeUser(createdUser) as UserGetProfileResponseDto;
  }

  async updateUser(
    userId: string,
    data: UserUpdateDto
  ): Promise<UserUpdateProfileResponseDto> {
    const user = await this.databaseService.user.findUnique({
      where: { id: userId },
    });
    if (!user || user.deletedAt) {
      throw new HttpException('user.error.userNotFound', HttpStatus.NOT_FOUND);
    }

    const normalizedEmail = data.email?.toLowerCase().trim();
    if (normalizedEmail) {
      const duplicatedEmail = await this.databaseService.user.findFirst({
        where: {
          email: normalizedEmail,
          id: { not: userId },
          deletedAt: null,
        },
      });
      if (duplicatedEmail) {
        throw new HttpException('user.error.userExists', HttpStatus.CONFLICT);
      }
    }

    const normalizedPhone = data.phone?.trim();
    if (normalizedPhone) {
      const duplicatedPhone = await this.databaseService.user.findFirst({
        where: {
          phone: normalizedPhone,
          id: { not: userId },
          deletedAt: null,
        },
      });
      if (duplicatedPhone) {
        throw new HttpException('user.error.userExists', HttpStatus.CONFLICT);
      }
    }

    const updatedUser = await this.databaseService.user.update({
      where: { id: userId },
      data: {
        ...data,
        email: normalizedEmail ?? data.email,
        phone: normalizedPhone ?? data.phone,
      } as any,
    });

    return this.normalizeUser(updatedUser) as UserUpdateProfileResponseDto;
  }

  async getNotificationPreferences(
    userId: string
  ): Promise<UserNotificationPreferencesResponseDto> {
    const user = await this.databaseService.user.findUnique({
      where: { id: userId },
    });
    if (!user || user.deletedAt) {
      throw new HttpException('user.error.userNotFound', HttpStatus.NOT_FOUND);
    }

    return this.getPreferencesFromUser(user);
  }

  async updateNotificationPreferences(
    userId: string,
    data: UserNotificationPreferencesUpdateDto
  ): Promise<UserNotificationPreferencesResponseDto> {
    const user = await this.databaseService.user.findUnique({
      where: { id: userId },
    });
    if (!user || user.deletedAt) {
      throw new HttpException('user.error.userNotFound', HttpStatus.NOT_FOUND);
    }

    const updateData: Record<string, boolean> = {};
    if (typeof data.notifyPush === 'boolean') {
      updateData.notifyPush = data.notifyPush;
    }
    if (typeof data.notifySms === 'boolean') {
      updateData.notifySms = data.notifySms;
    }
    if (typeof data.notifyEmail === 'boolean') {
      updateData.notifyEmail = data.notifyEmail;
    }

    if (Object.keys(updateData).length === 0) {
      return this.getPreferencesFromUser(user);
    }

    const updatedUser = await this.databaseService.user.update({
      where: { id: userId },
      data: updateData as any,
    });

    return this.getPreferencesFromUser(updatedUser);
  }

  async updateExpoPushToken(
    userId: string,
    data: UserExpoPushTokenUpdateDto
  ): Promise<UserExpoPushTokenResponseDto> {
    const user = await this.databaseService.user.findUnique({
      where: { id: userId },
    });
    if (!user || user.deletedAt) {
      throw new HttpException('user.error.userNotFound', HttpStatus.NOT_FOUND);
    }

    const updated = await this.databaseService.user.update({
      where: { id: userId },
      data: { expoPushToken: data.expoPushToken },
    });

    return { expoPushToken: updated.expoPushToken as string };
  }

  /**
   * Smoke test do push: envia uma notificação para o expoPushToken do user
   * autenticado, ignorando a flag notifyPush. Útil para diagnosticar
   * config Expo / token inválido sem ter de gerar um booking.
   */
  async sendTestPush(userId: string): Promise<{
    pushEnabled: boolean;
    hasExpoPushToken: boolean;
    notifyPush: boolean;
    dispatch: {
      success: boolean;
      provider: string;
      error?: string;
      details?: Record<string, unknown>;
    } | null;
  }> {
    const user = await this.databaseService.user.findUnique({
      where: { id: userId },
    });
    if (!user || user.deletedAt) {
      throw new HttpException('user.error.userNotFound', HttpStatus.NOT_FOUND);
    }

    const pushEnabled = this.helperNotificationService.isPushEnabled();
    const hasExpoPushToken = Boolean(user.expoPushToken);

    if (!hasExpoPushToken) {
      return {
        pushEnabled,
        hasExpoPushToken,
        notifyPush: user.notifyPush,
        dispatch: null,
      };
    }

    const dispatch = await this.helperNotificationService.sendPush({
      to: user.expoPushToken!,
      title: 'Push de teste',
      body: 'Se vês isto, o push notification está a funcionar.',
      data: { type: 'test', userId },
    });

    return {
      pushEnabled,
      hasExpoPushToken,
      notifyPush: user.notifyPush,
      dispatch,
    };
  }

  async deleteUser(userId: string): Promise<ApiGenericResponseDto> {
    try {
      const user = await this.databaseService.user.findUnique({
        where: { id: userId },
      });
      if (!user) {
        throw new HttpException(
          'user.error.userNotFound',
          HttpStatus.NOT_FOUND
        );
      }
      await this.databaseService.user.update({
        where: { id: userId },
        data: { deletedAt: new Date() },
      });

      return {
        success: true,
        message: 'user.success.userDeleted',
      };
    } catch (error) {
      throw error;
    }
  }

  async suspendUser(
    userId: string,
    suspendedBy: string
  ): Promise<ApiGenericResponseDto> {
    const user = await this.databaseService.user.findUnique({
      where: { id: userId },
    });
    if (!user || user.deletedAt) {
      throw new HttpException('user.error.userNotFound', HttpStatus.NOT_FOUND);
    }
    if (user.suspendedAt) {
      throw new HttpException('user.error.alreadySuspended', HttpStatus.CONFLICT);
    }
    if (user.role === Role.ADMIN) {
      throw new HttpException('auth.error.forbidden', HttpStatus.FORBIDDEN);
    }

    await this.databaseService.user.update({
      where: { id: userId },
      data: { suspendedAt: new Date() },
    });

    return {
      success: true,
      message: 'user.success.userSuspended',
    };
  }

  async unsuspendUser(
    userId: string,
    unsuspendedBy: string
  ): Promise<ApiGenericResponseDto> {
    const user = await this.databaseService.user.findUnique({
      where: { id: userId },
    });
    if (!user || user.deletedAt) {
      throw new HttpException('user.error.userNotFound', HttpStatus.NOT_FOUND);
    }
    if (!user.suspendedAt) {
      throw new HttpException('user.error.notSuspended', HttpStatus.CONFLICT);
    }

    await this.databaseService.user.update({
      where: { id: userId },
      data: { suspendedAt: null },
    });

    return {
      success: true,
      message: 'user.success.userUnsuspended',
    };
  }

  async getProfile(id: string): Promise<UserGetProfileResponseDto> {
    const user = await this.databaseService.user.findUnique({
      where: { id },
    });
    if (!user || user.deletedAt) {
      throw new HttpException('user.error.userNotFound', HttpStatus.NOT_FOUND);
    }
    return this.normalizeUser(user) as UserGetProfileResponseDto;
  }

  async getListOfUsers(
    userId: string,
    q?: string,
    page?: number,
    pageSize?: number,
    offset?: number,
    limit?: number,
    sortBy?: string,
    sortOrder?: 'asc' | 'desc',
    gender?: string,
    role?: string,
    allowedRoles?: Role[]
  ): Promise<ApiPaginatedDataDto<UserGetProfileResponseDto>> {
    const DEFAULT_PAGE = 1;
    const DEFAULT_PAGE_SIZE = 10;
    const MAX_PAGE_SIZE = 100;
    const DEFAULT_SORT_BY: keyof Prisma.UserOrderByWithRelationInput =
      'createdAt';
    const ALLOWED_SORT_FIELDS = new Set<
      keyof Prisma.UserOrderByWithRelationInput
    >([
      'firstName',
      'lastName',
      'phone',
      'email',
      'gender',
      'createdAt',
      'updatedAt',
    ]);

    const parsedPage = Number(page);
    const parsedPageSize = Number(pageSize);
    const parsedOffset = Number(offset);
    const parsedLimit = Number(limit);

    const safePage =
      Number.isInteger(parsedPage) && parsedPage > 0
        ? parsedPage
        : DEFAULT_PAGE;

    const safePageSize =
      Number.isInteger(parsedPageSize) && parsedPageSize > 0
        ? Math.min(parsedPageSize, MAX_PAGE_SIZE)
        : DEFAULT_PAGE_SIZE;

    const hasOffset = Number.isInteger(parsedOffset) && parsedOffset >= 0;
    const hasLimit = Number.isInteger(parsedLimit) && parsedLimit > 0;
    const take = hasLimit ? Math.min(parsedLimit, MAX_PAGE_SIZE) : safePageSize;
    const skip = hasOffset ? parsedOffset : (safePage - 1) * take;
    const currentPage = hasOffset ? Math.floor(skip / take) + 1 : safePage;

    const safeSortField = ALLOWED_SORT_FIELDS.has(
      sortBy as keyof Prisma.UserOrderByWithRelationInput
    )
      ? (sortBy as keyof Prisma.UserOrderByWithRelationInput)
      : DEFAULT_SORT_BY;
    const safeSortOrder: Prisma.SortOrder =
      sortOrder === 'asc' ? 'asc' : 'desc';

    const searchQuery = q?.trim();
    const normalizedGender = gender?.trim().toUpperCase();
    const safeGender =
      normalizedGender &&
      Object.values($Enums.Gender).includes(normalizedGender as $Enums.Gender)
        ? (normalizedGender as $Enums.Gender)
        : undefined;
    const normalizedRole = role?.trim().toUpperCase();
    const safeRole =
      normalizedRole &&
      Object.values(Role).includes(normalizedRole as Role)
        ? (normalizedRole as Role)
        : undefined;
    const safeAllowedRoles = Array.isArray(allowedRoles)
      ? allowedRoles.filter(item => Object.values(Role).includes(item))
      : [];

    if (
      safeRole &&
      safeAllowedRoles.length > 0 &&
      !safeAllowedRoles.includes(safeRole)
    ) {
      throw new HttpException('auth.error.forbidden', HttpStatus.FORBIDDEN);
    }

    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      id: { not: userId },
      ...(safeGender ? { gender: safeGender } : {}),
      ...(safeRole
        ? { role: safeRole }
        : safeAllowedRoles.length > 0
          ? { role: { in: safeAllowedRoles } }
          : {}),
      ...(searchQuery
        ? {
            OR: [
              { firstName: { contains: searchQuery, mode: 'insensitive' } },
              { lastName: { contains: searchQuery, mode: 'insensitive' } },
              { phone: { contains: searchQuery, mode: 'insensitive' } },
              { email: { contains: searchQuery, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [totalItems, users] = await Promise.all([
      this.databaseService.user.count({ where }),
      this.databaseService.user.findMany({
        where,
        orderBy: { [safeSortField]: safeSortOrder },
        skip,
        take,
      }),
    ]);

    return {
      items: users.map(user =>
        this.normalizeUser(user)
      ) as UserGetProfileResponseDto[],
      metadata: {
        currentPage,
        itemsPerPage: take,
        totalItems,
        totalPages: Math.ceil(totalItems / take),
      },
    };
  }

  private getPreferencesFromUser(
    user: Record<string, any>
  ): UserNotificationPreferencesResponseDto {
    return {
      notifyPush: typeof user.notifyPush === 'boolean' ? user.notifyPush : true,
      notifySms: typeof user.notifySms === 'boolean' ? user.notifySms : true,
      notifyEmail:
        typeof user.notifyEmail === 'boolean' ? user.notifyEmail : true,
    };
  }

  private normalizeUser<T extends Record<string, any>>(user: T): T {
    const { expoPushToken: _expoPushToken, ...safeUser } = user;
    return {
      ...safeUser,
      avatarUrl: safeUser.avatarUrl ?? null,
      level: safeUser.level ?? null,
      favoriteCourt: safeUser.favoriteCourt ?? null,
      preferredTimeSlots: Array.isArray(safeUser.preferredTimeSlots)
        ? safeUser.preferredTimeSlots
        : [],
      ...this.getPreferencesFromUser(user),
    } as unknown as T;
  }

  private generatePassword(): string {
    return crypto.randomBytes(9).toString('base64url').slice(0, 12);
  }
}
