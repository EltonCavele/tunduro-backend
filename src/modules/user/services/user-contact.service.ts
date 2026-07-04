import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, Role, User, UserContact } from '@prisma/client';

import { DatabaseService } from 'src/common/database/services/database.service';
import { HelperNotificationService } from 'src/common/helper/services/helper.notification.service';
import { ApiGenericResponseDto } from 'src/common/response/dtos/response.generic.dto';
import { ApiPaginatedDataDto } from 'src/common/response/dtos/response.paginated.dto';

import {
  UserContactCreateDto,
  UserContactInviteDto,
  UserContactListQueryDto,
} from '../dtos/request/user.contact.request';
import { UserContactResponseDto } from '../dtos/response/user.contact.response';
import { UserGetProfileResponseDto } from '../dtos/response/user.response';
import { buildUserContactInviteEmail } from '../helpers/user-contact-invite-email.helper';
import { normalizeUser } from '../helpers/user-mapper.helper';

const DEFAULT_CONTACTS_PAGE = 1;
const DEFAULT_CONTACTS_PAGE_SIZE = 20;

@Injectable()
export class UserContactService {
  constructor(
    private readonly db: DatabaseService,
    private readonly notificationService: HelperNotificationService,
    private readonly configService: ConfigService
  ) {}

  async listContacts(
    ownerUserId: string,
    query: UserContactListQueryDto
  ): Promise<ApiPaginatedDataDto<UserContactResponseDto>> {
    const currentPage = query.page ?? DEFAULT_CONTACTS_PAGE;
    const take = query.pageSize ?? DEFAULT_CONTACTS_PAGE_SIZE;
    const skip = (currentPage - 1) * take;
    const search = query.q?.trim();
    const where: Prisma.UserContactWhereInput = {
      ownerUserId,
      deletedAt: null,
      ...(search
        ? {
            OR: [
              { displayName: { contains: search, mode: 'insensitive' } },
              { email: { contains: search.toLowerCase() } },
              { phone: { contains: search } },
            ],
          }
        : {}),
    };

    const [contacts, totalItems] = await Promise.all([
      this.db.userContact.findMany({
        where,
        orderBy: [{ displayName: 'asc' }, { email: 'asc' }],
        skip,
        take,
      }),
      this.db.userContact.count({ where }),
    ]);

    const linkedUsers = await this.getLinkedUsers(contacts);

    return {
      items: contacts.map(contact =>
        this.mapContact(contact, linkedUsers.get(contact.email.toLowerCase()))
      ),
      metadata: {
        currentPage,
        itemsPerPage: take,
        totalItems,
        totalPages: Math.ceil(totalItems / take),
      },
    };
  }

  async createContact(
    ownerUserId: string,
    payload: UserContactCreateDto
  ): Promise<UserContactResponseDto> {
    const email = payload.email.trim().toLowerCase();
    const owner = await this.db.user.findFirst({
      where: { id: ownerUserId, deletedAt: null },
      select: { email: true },
    });
    if (!owner) {
      throw new HttpException('user.error.userNotFound', HttpStatus.NOT_FOUND);
    }
    if (owner.email.toLowerCase() === email) {
      throw new HttpException(
        'user.error.contactSelfNotAllowed',
        HttpStatus.BAD_REQUEST
      );
    }

    const updateData: Prisma.UserContactUpdateInput = { deletedAt: null };
    if (payload.displayName !== undefined) {
      updateData.displayName = payload.displayName?.trim() || null;
    }
    if (payload.phone !== undefined) {
      updateData.phone = payload.phone?.trim() || null;
    }

    const contact = await this.db.userContact.upsert({
      where: { ownerUserId_email: { ownerUserId, email } },
      create: {
        ownerUserId,
        email,
        displayName: payload.displayName?.trim() || null,
        phone: payload.phone?.trim() || null,
      },
      update: updateData,
    });
    const linkedUser = await this.db.user.findFirst({
      where: {
        email,
        deletedAt: null,
        role: { in: [Role.USER, Role.MEMBER] },
      },
    });

    return this.mapContact(contact, linkedUser ?? undefined);
  }

  async inviteContact(
    ownerUserId: string,
    payload: UserContactInviteDto
  ): Promise<UserContactResponseDto> {
    const contact = await this.createContact(ownerUserId, payload);
    if (contact.linkedUserId) {
      return contact;
    }

    const appName = this.configService.get<string>('app.name') ?? 'Tunduro';
    const email = buildUserContactInviteEmail({
      appName,
      downloadLinks: {
        ios: this.configService.get<string>('app.downloadIosUrl') || undefined,
        android:
          this.configService.get<string>('app.downloadAndroidUrl') || undefined,
        fallback:
          this.configService.get<string>('app.downloadFallbackUrl') ||
          undefined,
      },
    });

    await this.notificationService.sendEmail({
      to: contact.email,
      subject: email.subject,
      html: email.html,
      text: email.text,
    });

    return contact;
  }

  async deleteContact(
    ownerUserId: string,
    contactId: string
  ): Promise<ApiGenericResponseDto> {
    const result = await this.db.userContact.updateMany({
      where: { id: contactId, ownerUserId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (result.count !== 1) {
      throw new HttpException(
        'user.error.contactNotFound',
        HttpStatus.NOT_FOUND
      );
    }

    return ApiGenericResponseDto.success('user.success.contactDeleted');
  }

  private async getLinkedUsers(
    contacts: UserContact[]
  ): Promise<Map<string, User>> {
    const emails = Array.from(
      new Set(contacts.map(contact => contact.email.toLowerCase()))
    );
    if (emails.length === 0) {
      return new Map();
    }

    const users = await this.db.user.findMany({
      where: {
        email: { in: emails },
        deletedAt: null,
        role: { in: [Role.USER, Role.MEMBER] },
      },
    });

    return new Map(users.map(user => [user.email.toLowerCase(), user]));
  }

  private mapContact(
    contact: UserContact,
    linkedUser?: User
  ): UserContactResponseDto {
    const normalizedLinkedUser = linkedUser
      ? (normalizeUser(linkedUser) as UserGetProfileResponseDto)
      : null;

    return {
      id: contact.id,
      displayName: contact.displayName ?? null,
      email: contact.email,
      phone: contact.phone ?? null,
      linkedUserId: normalizedLinkedUser?.id ?? null,
      linkedUser: normalizedLinkedUser,
    };
  }
}
