import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';

import { DatabaseService } from 'src/common/database/services/database.service';

interface PrepareCheckoutInvitesArgs {
  organizerId: string;
  participantUserIds?: string[];
  inviteEmails?: string[];
  skipContactValidation?: boolean;
}

interface PreparedCheckoutInvites {
  participantUserIds: string[];
  inviteEmails: string[];
}

@Injectable()
export class BookingInviteContactService {
  constructor(private readonly db: DatabaseService) {}

  async prepareCheckoutInvites(
    args: PrepareCheckoutInvitesArgs
  ): Promise<PreparedCheckoutInvites> {
    const participantUserIds = Array.from(
      new Set(
        (args.participantUserIds ?? [])
          .map(userId => userId.trim())
          .filter(userId => userId && userId !== args.organizerId)
      )
    );
    const inviteEmails = Array.from(
      new Set(
        (args.inviteEmails ?? [])
          .map(email => email.trim().toLowerCase())
          .filter(Boolean)
      )
    );

    if (args.skipContactValidation) {
      return { participantUserIds, inviteEmails };
    }

    const organizer = await this.db.user.findFirst({
      where: { id: args.organizerId, deletedAt: null },
      select: { email: true },
    });
    if (!organizer) {
      throw new HttpException('user.error.userNotFound', HttpStatus.NOT_FOUND);
    }

    const participantUsers = participantUserIds.length
      ? await this.db.user.findMany({
          where: {
            id: { in: participantUserIds },
            deletedAt: null,
            role: { in: [Role.USER, Role.MEMBER] },
          },
          select: { id: true, email: true },
        })
      : [];
    if (participantUsers.length !== participantUserIds.length) {
      throw new HttpException(
        'booking.error.inviteContactRequired',
        HttpStatus.FORBIDDEN
      );
    }

    const organizerEmail = organizer.email.toLowerCase();
    const participantEmails = new Set(
      participantUsers.map(user => user.email.toLowerCase())
    );
    const filteredInviteEmails = inviteEmails.filter(
      email => email !== organizerEmail && !participantEmails.has(email)
    );

    if (participantEmails.size > 0) {
      const contacts = await this.db.userContact.findMany({
        where: {
          ownerUserId: args.organizerId,
          deletedAt: null,
          email: { in: Array.from(participantEmails) },
        },
        select: { email: true },
      });
      const contactEmails = new Set(
        contacts.map(contact => contact.email.toLowerCase())
      );

      for (const email of participantEmails) {
        if (!contactEmails.has(email)) {
          throw new HttpException(
            'booking.error.inviteContactRequired',
            HttpStatus.FORBIDDEN
          );
        }
      }
    }

    for (const email of filteredInviteEmails) {
      await this.db.userContact.upsert({
        where: {
          ownerUserId_email: {
            ownerUserId: args.organizerId,
            email,
          },
        },
        create: {
          ownerUserId: args.organizerId,
          email,
        },
        update: {
          deletedAt: null,
        } as Prisma.UserContactUpdateInput,
      });
    }

    return { participantUserIds, inviteEmails: filteredInviteEmails };
  }
}
