import { Prisma } from '@prisma/client';

export const USER_LIST_DEFAULT_PAGE = 1;
export const USER_LIST_DEFAULT_PAGE_SIZE = 10;
export const USER_LIST_MAX_PAGE_SIZE = 100;
export const USER_LIST_DEFAULT_SORT_BY: keyof Prisma.UserOrderByWithRelationInput =
  'createdAt';
export const USER_LIST_ALLOWED_SORT_FIELDS = new Set<
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
